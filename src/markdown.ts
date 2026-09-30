/*
 * edge-markdown
 *
 * (c) Edge
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { VFile } from 'vfile'
import { type Root } from 'hast'
import { type Edge } from 'edge.js'
import { readFile } from 'node:fs/promises'
import { parseFrontMatter } from 'remark-mdc'

import { type Cache } from './cache.ts'
import { MarkdownParser } from './parser.ts'
import { isVoidElement, stringifyAttributes, createRenderingContext } from './utils.ts'
import { type ParserOptions, type RendererOptions, type MarkdownOptions } from './types.ts'

/**
 * The Markdown class exposes the API for parsing and rendering
 * markdown documents to HTML.
 *
 * @example
 * ```typescript
 * const markdown = new Markdown(edgeRenderer, components, cache)
 * const result = await markdown.render({ content: '# Hello World' })
 * ```
 */
export class Markdown {
  #components: RendererOptions['components']
  #options: RendererOptions & ParserOptions
  #edgeRenderer: ReturnType<Edge['share']>

  /**
   * These utilities are used by the templates registered within
   * the "plugin.ts" file
   *
   * @example
   * ```typescript
   * markdown.utils.isVoidElement('img') // true
   * ```
   */
  utils = { stringifyAttributes, isVoidElement }
  #cache: Cache<
    string,
    {
      toc: string
      content: string
      frontmatter: Record<string, any>
      messages: VFile['messages']
    }
  >

  /**
   * Create a new instance of the Markdown class
   *
   * @param edgeRenderer - Shared Edge renderer instance for template rendering
   * @param discoveredComponents - Components discovered during registration
   * @param cache - Cache instance for storing rendered results
   * @param options - Optional parser and renderer configuration options
   *
   * @example
   * ```typescript
   * const cache = new Cache()
   * const components = { 'custom-heading': 'path/to/component' }
   * const markdown = new Markdown(edgeRenderer, components, cache, {
   *   highlight: true,
   *   toc: { enabled: true }
   * })
   * ```
   */
  constructor(
    edgeRenderer: ReturnType<Edge['share']>,
    discoveredComponents: RendererOptions['components'],
    cache: Cache<
      string,
      {
        toc: string
        content: string
        frontmatter: Record<string, any>
        messages: VFile['messages']
      }
    >,
    options?: Partial<RendererOptions & ParserOptions>
  ) {
    this.#cache = cache
    this.#edgeRenderer = edgeRenderer
    this.#options = {
      allowHTML: true,
      components: {},
      remarkPlugins: [],
      rehypePlugins: [],
      highlight: true,
      hooks: [],
      toc: { enabled: true, maxDepth: 2, minDepth: 2 },
      ...options,
    }
    this.#components = { ...discoveredComponents, ...this.#options.components }
  }

  /**
   * Deep merges components property in renderer options
   *
   * @param options - Markdown options containing components to merge
   * @returns Merged renderer options with components combined
   *
   * @example
   * ```typescript
   * const merged = this.#mergeRendererOptions({
   *   components: { 'h1': 'custom-heading' }
   * })
   * ```
   */
  #mergeRendererOptions(options: MarkdownOptions) {
    return {
      ...this.#options,
      ...options,
      components: {
        ...this.#components,
        ...options.components,
      },
    }
  }

  /**
   * Parse a markdown file or contents to AST. You may access the AST
   * using the "result.vFile.result" property
   *
   * @param options - Options specifying either file path or content string to parse
   * @returns Promise resolving to parsed result with AST, frontmatter, and TOC
   *
   * @example
   * ```typescript
   * // Parse from file
   * const result = await markdown.parse({ file: './content.md' })
   *
   * // Parse from content string
   * const result = await markdown.parse({ content: '# Hello World' })
   * ```
   */
  async parse(options: MarkdownOptions) {
    let vFile: VFile
    if ('file' in options) {
      vFile = new VFile({
        path: options.file,
        value: await readFile(options.file, 'utf-8'),
      })
    } else {
      vFile = new VFile({
        value: options.content,
      })
    }

    return MarkdownParser.parse(vFile, { ...this.#options, ...options })
  }

  /**
   * Render a markdown file or contents to HTML using edge templates.
   *
   * @param options - Options specifying either file path or content string to render
   * @returns Promise resolving to rendered HTML content with TOC, frontmatter, and messages
   *
   * @example
   * ```typescript
   * // Render from file with caching
   * const result = await markdown.render({
   *   file: './content.md',
   *   cacheKey: 'article-1',
   *   highlight: true
   * })
   *
   * // Render from content string
   * const result = await markdown.render({
   *   content: '# Hello\n\nWorld with **bold** text'
   * })
   * console.log(result.content) // HTML output
   * console.log(result.toc) // Table of contents HTML
   * console.log(result.frontmatter) // Parsed frontmatter
   * ```
   */
  async render(options: MarkdownOptions) {
    const cacheKey = options.cacheKey
    if (cacheKey && this.#cache.has(cacheKey)) {
      return this.#cache.get(cacheKey)
    }

    const { vFile, toc, frontmatter } = await this.parse(options)
    const content = await this.#edgeRenderer.render('markdown_root', {
      node: vFile.result,
      $renderingContext: createRenderingContext(
        this.#mergeRendererOptions(options),
        vFile,
        frontmatter
      ),
    })

    const result = {
      toc: toc
        ? await this.#edgeRenderer.render('markdown_toc', {
            node: toc,
            $renderingContext: createRenderingContext(
              this.#mergeRendererOptions(options),
              vFile,
              frontmatter
            ),
          })
        : '',
      content,
      frontmatter,
      messages: vFile.messages,
    }

    if (cacheKey) {
      this.#cache.set(cacheKey, result)
    }

    return result
  }

  /**
   * Extract YAML frontmatter from a markdown file or content string
   * without running the full parsing pipeline.
   *
   * @param options - Options specifying either file path or content string
   * @returns Promise resolving to the parsed frontmatter object
   *
   * @example
   * ```typescript
   * const data = await markdown.frontmatter({ file: './content.md' })
   * console.log(data.title) // frontmatter field
   * ```
   */
  async frontmatter(options: { file: string } | { content: string }) {
    let contents: string
    if ('file' in options) {
      contents = await readFile(options.file, 'utf-8')
    } else {
      contents = options.content
    }
    const { data } = parseFrontMatter(contents)
    return data
  }

  /**
   * Parse and render only the content before the first h2 heading.
   * Returns the same shape as `render()` but with truncated content
   *
   * @param options - Options specifying either file path or content string to render
   * @returns Promise resolving to rendered preview HTML with frontmatter and messages
   *
   * @example
   * ```typescript
   * const result = await markdown.preview({ file: './content.md' })
   * console.log(result.content) // HTML before first h2
   * ```
   */
  async preview(options: MarkdownOptions) {
    const cacheKey = options.cacheKey ? `preview-${options.cacheKey}` : undefined
    if (cacheKey && this.#cache.has(cacheKey)) {
      return this.#cache.get(cacheKey)
    }

    const { vFile, toc, frontmatter } = await this.parse(options)
    const root = vFile.result as Root

    const firstH2Index = root.children.findIndex(
      (node) => node.type === 'element' && node.tagName === 'h2'
    )
    if (firstH2Index !== -1) {
      root.children = root.children.slice(0, firstH2Index)
    }

    const content = await this.#edgeRenderer.render('markdown_root', {
      node: root,
      $renderingContext: createRenderingContext(
        this.#mergeRendererOptions(options),
        vFile,
        frontmatter
      ),
    })

    const result = {
      toc: toc
        ? await this.#edgeRenderer.render('markdown_toc', {
            node: toc,
            $renderingContext: createRenderingContext(
              this.#mergeRendererOptions(options),
              vFile,
              frontmatter
            ),
          })
        : '',
      content,
      frontmatter,
      messages: vFile.messages,
    }

    if (cacheKey) {
      this.#cache.set(cacheKey, result)
    }

    return result
  }
}
