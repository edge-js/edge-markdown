/*
 * edge-markdown
 *
 * (c) Edge
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { type VFile } from 'vfile'
import { type Edge } from 'edge.js'
import { htmlEscape } from 'escape-goat'
import { find, html } from 'property-information'
import { type VoidHtmlTags, voidHtmlTags } from 'html-tags'
import { type ElementContent, type Comment, type Element, type Text, type Root } from 'hast'
import { type RendererOptions } from './types.ts'

/**
 * Find if element is a void HTML element or not
 *
 * @param element - HTML tag name to check
 * @returns True if the element is a void element (self-closing)
 *
 * @example
 * ```typescript
 * isVoidElement('img') // true
 * isVoidElement('div') // false
 * ```
 */
export function isVoidElement(element: VoidHtmlTags): element is VoidHtmlTags {
  return voidHtmlTags.includes(element)
}

/**
 * Stringify an object to props to HTML attributes
 *
 * @param props - Object containing HTML properties to convert to attribute string
 * @returns HTML attribute string with proper escaping and formatting
 *
 * @example
 * ```typescript
 * stringifyAttributes({ id: 'main', class: ['btn', 'primary'] })
 * // ' id="main" class="btn primary"'
 * ```
 */
export function stringifyAttributes(props: any): string {
  const attributes = Object.keys(props)
  if (attributes.length === 0) {
    return ''
  }

  return ` ${attributes
    .reduce<string[]>((result, key) => {
      const propInfo = find(html, key)
      if (!propInfo || propInfo.space === 'svg') {
        return result
      }

      let value = props[key]

      /**
       * Join array values with correct seperator
       */
      if (Array.isArray(value)) {
        value = value.join(propInfo.commaSeparated ? ',' : ' ')
      }

      /**
       * Wrap values inside double quotes when not booleanish
       */
      if (!propInfo.booleanish && !propInfo.number) {
        value = `"${htmlEscape(value)}"`
      }

      /**
       * Push key value string
       */
      result.push(`${propInfo.attribute}=${value}`)
      return result
    }, [])
    .join(' ')}`
}

/**
 * Returns a collection of markdown components for a given edge
 * instance. Only considers components from the default disk
 *
 * @param edge - Edge.js instance to discover components from
 * @param prefix - Component prefix to filter by (e.g., 'markdown')
 * @returns Object mapping tag names to component paths
 *
 * @example
 * ```typescript
 * const components = discoverMarkdownComponents(edge, 'markdown')
 * // { 'custom-heading': 'components/markdown/custom-heading' }
 * ```
 */
export function discoverMarkdownComponents(edge: Edge, prefix: string) {
  const componentsBasePath = `components/${prefix}/`
  const defaultDisk = edge.loader.listComponents().find((d) => d.diskName === 'default')
  const components = defaultDisk?.components ?? []

  return components.reduce<RendererOptions['components']>((result, { componentName }) => {
    /**
     * Only consider markdown components
     */
    if (!componentName.startsWith(componentsBasePath)) {
      return result
    }

    /**
     * Collect components with the tagName.
     */
    const tagName = componentName.replace(new RegExp(componentsBasePath), '').replace(/_/g, '-')
    result[tagName] = componentName
    return result
  }, {})
}

/**
 * Process MDC (Markdown Component) props by resolving frontmatter references
 *
 * @param props - Component properties to process
 * @param frontmatter - Frontmatter data to resolve references from
 * @returns Processed props with frontmatter values resolved
 *
 * @example
 * ```typescript
 * processMdcProps({ ':title': 'pageTitle', content: 'static' }, { pageTitle: 'Hello' })
 * // { title: 'Hello', content: 'static' }
 * ```
 */
export function processMdcProps(props: Record<string, any>, frontmatter: Record<string, any>) {
  return Object.keys(props).reduce<Record<string, any>>((result, key) => {
    const value = props[key]
    if (key.startsWith(':') && value) {
      result[key.slice(1)] = value in frontmatter ? frontmatter[value] : JSON.parse(value)
    } else {
      result[key] = value
    }
    return result
  }, {})
}

/**
 * Returns the children node for a given slot or the main slot
 *
 * @param node - HAST Element node to extract slots from
 * @returns Object mapping slot names to their child elements
 *
 * @example
 * ```typescript
 * const slots = getNodeSlots(elementNode)
 * // { main: [...], header: [...], footer: [...] }
 * ```
 */
export function getNodeSlots(node: Element) {
  return node.children.reduce<Record<string, ElementContent[]>>(
    (result, child) => {
      if (child.type === 'element' && child.tagName === 'component-slot') {
        const slotName = Object.keys(child.properties)[0].replace('v-slot:', '')
        result[slotName] = child.children
      } else {
        result.main.push(child)
      }

      return result
    },
    {
      main: [],
    }
  )
}

/**
 * Returns the rendering context to be shared by reference with
 * all markdown related components
 *
 * @param options - Renderer configuration options
 * @param vFile - VFile instance containing the parsed content
 * @param frontmatter - Parsed frontmatter data from the document
 * @returns Rendering context with component resolution methods
 *
 * @example
 * ```typescript
 * const context = createRenderingContext(options, vFile, frontmatter)
 * const [component, props] = context.getComponentFor(textNode)
 * ```
 */
export function createRenderingContext(
  options: RendererOptions,
  vFile: VFile,
  frontmatter: Record<string, any>
) {
  return {
    vFile,
    frontmatter,
    getComponentFor(node: Text | Element | Comment | Root): [string, Record<string, any>] {
      if (node.type === 'text') {
        return ['markdown_text', { node }]
      }

      if (node.type === 'comment') {
        return ['markdown_void', {}]
      }

      if (node.type === 'root') {
        return ['markdown_root', { node }]
      }

      node.properties = processMdcProps(node.properties, frontmatter)

      /**
       * Skip when tag is not in the allowed list
       */
      if (options.allowed && options.allowed.length && !options.allowed.includes(node.tagName)) {
        return ['markdown_void', {}]
      }

      let component: void | undefined | boolean | [string, any]

      /**
       * Loop through the hooks and allow them to pick a custom
       * component, mutate the node or attach messages to the
       * vFile.
       */
      for (let hook of options.hooks) {
        component = hook(node, this.vFile, frontmatter)
        if (component !== undefined) {
          break
        }
      }

      /**
       * Do not render the component when hook returns
       * false
       */
      if (component === false) {
        return ['markdown_void', {}]
      }

      /**
       * Use the component returned by the hook
       */
      if (Array.isArray(component)) {
        return [component[0], { ...component[1], markdownSlots: getNodeSlots(node) }]
      }

      /**
       * Render pre-defined component
       */
      if (options.components[node.tagName]) {
        return [
          options.components[node.tagName],
          { node, ...frontmatter, ...node.properties, markdownSlots: getNodeSlots(node) },
        ]
      }

      /**
       * Render default component
       */
      return ['markdown_element', { node, ...frontmatter, ...node.properties }]
    },
  }
}
