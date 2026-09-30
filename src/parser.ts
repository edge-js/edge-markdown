/*
 * edge-markdown
 *
 * (c) Edge
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { type VFile } from 'vfile'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import rehypeSlug from 'rehype-slug'
import remarkParse from 'remark-parse'
import remarkRehype from 'remark-rehype'
import { visit } from 'unist-util-visit'
import { toHast } from 'mdast-util-to-hast'
import { type Node as HastNode } from 'hast'
import { type Plugin, unified } from 'unified'
import { toc as mdastToc } from 'mdast-util-toc'
import remarkMDC, { parseFrontMatter } from 'remark-mdc'
import rehypeAutolinkHeadings from 'rehype-autolink-headings'
import remarkSqueezeParagraphs from 'remark-squeeze-paragraphs'
import rehypeShiki, { type RehypeShikiOptions } from '@shikijs/rehype'
import {
  transformerNotationDiff,
  transformerNotationFocus,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from '@shikijs/transformers'

import { type ParserOptions } from './types.ts'

/**
 * The defaults to use when using shiki
 */
const SHIKI_DEFAULTS: RehypeShikiOptions = {
  theme: 'material-theme-palenight',
  langs: ['typescript', 'html', 'css', 'sql', 'dotenv', 'bash', 'edge'],
  transformers: [
    transformerNotationDiff({
      matchAlgorithm: 'v3',
    }),
    transformerNotationHighlight({
      matchAlgorithm: 'v3',
    }),
    transformerNotationWordHighlight({
      matchAlgorithm: 'v3',
    }),
    transformerNotationFocus({
      matchAlgorithm: 'v3',
    }),
    {
      pre(node) {
        const meta = this.options.meta?.__raw ?? ''
        const pairs = meta.split(/\s+(?=([^"]*"[^"]*")*[^"]*$)/)
        node.properties = pairs.reduce((result, pair) => {
          const [key, value] = pair.split('=')
          if (!key) {
            return result
          }
          result[key] = value?.replace(/^"/, '').replace(/"$/, '') ?? true
          return result
        }, node.properties)
      },
    },
  ],
}

/**
 * Exposes static interface for parsing markdown docs using
 * remark.
 *
 * @example
 * ```typescript
 * const vFile = new VFile({ value: '# Hello World' })
 * const result = await MarkdownParser.parse(vFile, options)
 * ```
 */
export class MarkdownParser {
  /**
   * Parses the table of contents and converts it to HAST tree
   *
   * @param options - TOC configuration options or boolean flag
   * @param resultCallback - Callback function to receive the generated TOC HAST node
   * @returns Plugin function that processes the markdown AST to extract TOC
   *
   * @example
   * ```typescript
   * stream.use(MarkdownParser.#parseToc, tocOptions, (toc) => console.log(toc))
   * ```
   */
  static #parseToc: Plugin<[options: ParserOptions['toc'], (generatedToc: HastNode) => void]> = (
    options,
    resultCallback
  ) => {
    return (tree) => {
      const toc = mdastToc(tree as any, typeof options === 'object' ? options : { minDepth: 2 }).map
      if (!toc) {
        return
      }

      resultCallback(toHast(toc))
    }
  }

  /**
   * Returns the AST as the result instead of compiled output
   *
   * @returns Plugin function that sets a custom compiler to pass through the AST
   *
   * @example
   * ```typescript
   * stream.use(MarkdownParser.#passThroughCompiler)
   * ```
   */
  static #passThroughCompiler: Plugin = function () {
    this.compiler = function (tree) {
      return tree as any
    }
  }

  /**
   * Shares the MDC components and other nodes metadata with
   * the HAST syntax tree.
   *
   * @returns Plugin function that transfers node attributes to HAST data properties
   *
   * @example
   * ```typescript
   * stream.use(MarkdownParser.#shareMdcMetaDataWithHastTree)
   * ```
   */
  static #shareMdcMetaDataWithHastTree: Plugin = function () {
    return function (tree) {
      visit(tree, (node) => {
        if ('attributes' in node && node.attributes && typeof node.attributes === 'object') {
          node.data = node.data ?? {}
          node.data.hProperties = { ...node.data.hProperties, ...node.attributes }
        }
      })
    }
  }

  /**
   * Parses markdown to AST
   *
   * @param vFile - VFile instance containing the markdown content to parse
   * @param options - Parser configuration options including plugins and features
   * @returns Promise resolving to parsed result with vFile, TOC, and frontmatter
   *
   * @example
   * ```typescript
   * const vFile = new VFile({ value: '# Hello\n\nWorld' })
   * const result = await MarkdownParser.parse(vFile, {
   *   highlight: true,
   *   toc: true,
   *   remarkPlugins: [],
   *   rehypePlugins: [],
   *   allowHTML: true
   * })
   * ```
   */
  static async parse(vFile: VFile, options: ParserOptions) {
    let toc: HastNode | null = null
    const { content, data: frontmatter } = parseFrontMatter(String(vFile.value))
    vFile.value = content

    const stream = unified()
      .use(remarkParse)
      .use(remarkMDC)
      .use(remarkGfm)
      .use(remarkSqueezeParagraphs)
      .use(this.#shareMdcMetaDataWithHastTree)

    /**
     * Optionally parsing TOC
     */
    if (options.toc === true || (typeof options.toc === 'object' && options.toc.enabled === true)) {
      stream.use(this.#parseToc, options.toc, (result) => (toc = result))
    }

    /**
     * Applying remark plugin before we convert MDAST AST to HAST
     */
    stream.use(options.remarkPlugins)

    /**
     * Converting the AST to HAST and applying its plugins
     */
    stream.use(remarkRehype, { allowDangerousHtml: options.allowHTML })

    /**
     * Optionally highlighting source code
     */
    if (
      options.highlight === true ||
      (typeof options.highlight === 'object' && options.highlight.enabled === true)
    ) {
      stream.use(
        rehypeShiki,
        options.highlight === true
          ? SHIKI_DEFAULTS
          : {
              ...SHIKI_DEFAULTS,
              ...options.highlight,
            }
      )
    }

    stream.use(rehypeRaw).use(rehypeSlug).use(rehypeAutolinkHeadings)

    /**
     * Applying rehype plugins
     */
    stream.use(options.rehypePlugins)
    await stream.use(this.#passThroughCompiler).process(vFile)

    return {
      vFile,
      toc,
      frontmatter,
    }
  }
}
