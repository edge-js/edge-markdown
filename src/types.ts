/*
 * edge-markdown
 *
 * (c) Edge
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { type VFile } from 'vfile'
import { type Element } from 'hast'
import { type PluggableList } from 'unified'
import { type RehypeShikiOptions } from '@shikijs/rehype'
import { type Options as TocOptions } from 'mdast-util-toc'

/**
 * Renderer hook function that allows customization of how individual HAST elements are rendered.
 *
 * Called for each HAST element during the rendering process, providing access to the node data,
 * VFile context, and parsed frontmatter. Enables dynamic component selection, node filtering,
 * and prop manipulation.
 *
 * @param node - The HAST Element node being processed
 * @param vFile - VFile instance containing the parsed content and metadata
 * @param frontmatter - Parsed frontmatter data from the Markdown document
 *
 * @returns Hook behavior control:
 * - `void | undefined`: Use default rendering behavior for this node
 * - `false`: Skip this node entirely from the rendered output
 * - `[componentName, props]`: Use the specified component with given props instead of default
 *
 * @example
 * ```typescript
 * const customHook: RendererHook = (node, vFile, frontmatter) => {
 *   // Skip rendering images in draft mode
 *   if (frontmatter.draft && node.tagName === 'img') {
 *     return false
 *   }
 *
 *   // Use custom component for code blocks
 *   if (node.tagName === 'pre') {
 *     return ['custom_code_block', { ...node.properties, theme: frontmatter.codeTheme }]
 *   }
 *
 *   // Use default behavior for other nodes
 *   return undefined
 * }
 * ```
 */
export type RendererHook = (
  node: Element,
  vFile: VFile,
  frontmatter: Record<string, any>
) => void | boolean | [string, Record<string, any>]

/**
 * Configuration options for the Markdown renderer, controlling how HAST elements
 * are converted to Edge.js components and HTML output.
 */
export type RendererOptions = {
  /**
   * Map of component names to their template paths for rendering specific Markdown elements.
   *
   * Allows overriding default rendering behavior by specifying custom Edge.js components
   * for different HAST node types. If not specified, components will be auto-discovered
   * from the "components/markdown" directory using the configured prefix.
   *
   * @example
   * ```typescript
   * {
   *   components: {
   *     'h1': 'components/markdown/custom_heading',
   *     'blockquote': 'components/markdown/custom_quote',
   *     'code': 'components/markdown/syntax_highlighter'
   *   }
   * }
   * ```
   */
  components: Record<string, string>

  /**
   * Whitelist of HTML element tag names that are allowed in the rendered output.
   *
   * When specified, only elements with tag names in this array will be rendered.
   * All other elements will be removed from the output and warnings will be generated
   * in the VFile messages. Useful for security and content filtering.
   *
   * @example
   * ```typescript
   * {
   *   allowed: ['p', 'h1', 'h2', 'h3', 'strong', 'em', 'a', 'ul', 'ol', 'li']
   * }
   * ```
   */
  allowed?: string[]

  /**
   * Array of renderer hook functions that execute for each HAST element during rendering.
   *
   * Hooks provide fine-grained control over the rendering process, allowing you to:
   * - Filter out specific elements based on conditions
   * - Override component selection for specific nodes
   * - Modify element properties before rendering
   * - Implement custom rendering logic based on frontmatter or context
   *
   * Hooks are executed in the order they appear in the array, and the first hook
   * that returns a non-undefined value determines the rendering behavior.
   *
   * @example
   * ```typescript
   * {
   *   hooks: [
   *     // Security hook - remove script tags
   *     (node) => node.tagName === 'script' ? false : undefined,
   *
   *     // Custom component hook - use special heading for h1
   *     (node, vFile, frontmatter) => {
   *       if (node.tagName === 'h1' && frontmatter.useCustomHeading) {
   *         return ['custom_hero_heading', { ...node.properties, level: 1 }]
   *       }
   *     }
   *   ]
   * }
   * ```
   */
  hooks: RendererHook[]
}

/**
 * Configuration options for the Markdown parser, controlling how raw Markdown
 * is processed into HAST (HTML Abstract Syntax Tree).
 */
export type ParserOptions = {
  /**
   * Array of Remark plugins to apply during Markdown parsing (MDAST processing).
   *
   * Remark plugins operate on the Markdown AST before it's converted to HTML AST.
   * Use these to extend Markdown syntax, transform content, or add custom processing.
   *
   * @example
   * ```typescript
   * {
   *   remarkPlugins: [
   *     remarkGfm,           // GitHub Flavored Markdown support
   *     remarkMath,          // Math notation support
   *     remarkEmoji,         // Emoji shortcode support
   *     [remarkToc, { tight: true }]  // Plugin with options
   *   ]
   * }
   * ```
   */
  remarkPlugins: PluggableList

  /**
   * Array of Rehype plugins to apply during HTML AST processing.
   *
   * Rehype plugins operate on the HTML AST (HAST) after Markdown has been converted
   * to HTML but before final rendering. Use these for HTML-specific transformations,
   * syntax highlighting, link processing, etc.
   *
   * @example
   * ```typescript
   * {
   *   rehypePlugins: [
   *     rehypeSlug,                    // Add IDs to headings
   *     rehypeAutolinkHeadings,        // Add anchor links to headings
   *     [rehypeExternalLinks, {        // Process external links
   *       target: '_blank',
   *       rel: 'noopener noreferrer'
   *     }]
   *   ]
   * }
   * ```
   */
  rehypePlugins: PluggableList

  /**
   * Whether to allow raw HTML in Markdown content.
   *
   * When `true`, HTML tags in Markdown will be preserved and rendered as HTML.
   * When `false`, HTML tags will be escaped and displayed as text for security.
   *
   * @default true
   *
   * @example
   * ```typescript
   * // allowHTML: true - renders as button
   * "<button onclick='alert()'>Click me</button>"
   *
   * // allowHTML: false - renders as escaped text
   * "&lt;button onclick='alert()'&gt;Click me&lt;/button&gt;"
   * ```
   */
  allowHTML: boolean

  /**
   * Syntax highlighting configuration for code blocks.
   *
   * - `boolean`: Enable/disable highlighting with default Shiki settings
   * - `object`: Enable highlighting with custom Shiki configuration
   *
   * When enabled, uses Shiki for syntax highlighting with support for multiple themes,
   * languages, and transformers like diff highlighting and line highlighting.
   *
   * @example
   * ```typescript
   * // Simple enable/disable
   * { highlight: true }
   *
   * // Custom configuration
   * {
   *   highlight: {
   *     enabled: true,
   *     theme: 'github-dark',
   *     langs: ['typescript', 'python', 'sql'],
   *     transformers: [
   *       transformerNotationDiff(),
   *       transformerNotationHighlight()
   *     ]
   *   }
   * }
   * ```
   */
  highlight: boolean | ({ enabled: boolean } & RehypeShikiOptions)

  /**
   * Table of contents (TOC) generation configuration.
   *
   * - `boolean`: Enable/disable TOC generation with default settings
   * - `object`: Enable TOC with custom mdast-util-toc options
   *
   * When enabled, automatically generates a table of contents based on heading
   * elements in the document. The TOC is available in the render result.
   *
   * @example
   * ```typescript
   * // Simple enable/disable
   * { toc: true }
   *
   * // Custom configuration
   * {
   *   toc: {
   *     enabled: true,
   *     maxDepth: 3,        // Only include h1, h2, h3
   *     tight: true,        // Generate tight list
   *     ordered: false,     // Use unordered list
   *     skip: 'Table of Contents'  // Skip headings with this text
   *   }
   * }
   * ```
   */
  toc: boolean | ({ enabled: boolean } & TocOptions)
}

/**
 * Options for parsing and rendering Markdown content, combining parser and renderer
 * configurations with the source content specification.
 *
 * This type merges all available parser and renderer options (as optional properties)
 * with a discriminated union for specifying the Markdown source - either from a file
 * path or directly as content string.
 *
 * @example
 * ```typescript
 * // Parse from file with custom options
 * const fileOptions: MarkdownOptions = {
 *   file: './content/article.md',
 *   highlight: true,
 *   toc: { enabled: true, maxDepth: 3 },
 *   components: {
 *     'blockquote': 'components/custom_quote'
 *   }
 * }
 *
 * // Parse from content string with hooks
 * const contentOptions: MarkdownOptions = {
 *   content: '# Hello World\n\nThis is **markdown**.',
 *   allowHTML: false,
 *   hooks: [
 *     (node) => node.tagName === 'h1' ? ['hero_heading', node.properties] : undefined
 *   ]
 * }
 * ```
 */
export type MarkdownOptions = Partial<RendererOptions & ParserOptions> & { cacheKey?: string } & (
    { file: string } | { content: string }
  )
