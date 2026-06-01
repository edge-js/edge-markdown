/*
 * edge-markdown
 *
 * (c) Edge
 *
 * For the full copyright and license information, please view the LICENSE
 * file that was distributed with this source code.
 */

import { Edge } from 'edge.js'
import { join } from 'node:path'
import { dedent } from 'ts-dedent'
import { test } from '@japa/runner'
import { readFile } from 'node:fs/promises'
import { edgeMarkdown } from '../src/plugin.ts'

test.group('Markdown', () => {
  test('parse markdown with GFM syntax', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/gfm.mdc') })

    assert.snapshot(result.content).match()
  })

  test('parse markdown from raw contents', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.render({
      content: await readFile(join(import.meta.dirname, 'fixtures/gfm.mdc'), 'utf-8'),
    })

    assert.snapshot(result.content).match()
  })

  test('parse markdown with MDC syntax', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/mdc.mdc') })
    assert.snapshot(result.content).match()
  })

  test('parse markdown components with slots', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/mdc_component_slots.mdc') })
    assert.snapshot(result.content).match()
  })

  test('parse yaml frontmatter', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/front_matter.mdc') })

    assert.snapshot(result.content).match()
  })

  test('parse codeblocks for line highlights, title, and diff markers', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/codeblocks.mdc') })
    assert.snapshot(result.content).match()
  })

  test('self configure shiki', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {
      highlight: {
        enabled: true,
        theme: 'andromeeda',
        langs: ['typescript'],
      },
    })

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/codeblocks.mdc') })
    assert.include(result.content, 'andromeeda')
  })

  test('disable code highlighting', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {
      highlight: false,
    })

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/codeblocks.mdc') })

    assert.include(result.content, '<pre><code class="language-ts">')
  })

  test('use hooks to skip rendering of nodes', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {
      hooks: [
        (node) => {
          if (node.type === 'element' && node.tagName === 'a') {
            return false
          }
        },
      ],
    })

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.render({
      content: dedent`
        # Hello world

        Here is a paragraph with a [link](./foo)
        `,
    })

    assert.equal(
      result.content.trim(),
      dedent`
        <h1 id="hello-world">Hello world</h1>
        <p>Here is a paragraph with a </p>
      `
    )
  })

  test('use hooks to use a custom component for a node', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.registerTemplate('anchor', {
      template: dedent`<a {{$props.only([]).merge({ class: ['anchor'], ...node.properties }).toAttrs()}}>
        @markdownSlot()
      </a>`,
    })

    edge.use(edgeMarkdown, {
      hooks: [
        (node) => {
          if (node.type === 'element' && node.tagName === 'a') {
            return ['anchor', { node }]
          }
        },
      ],
    })

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.render({
      content: dedent`
        # Hello world

        Here is a paragraph with a [link](./foo)
        `,
    })

    assert.equal(
      result.content.trim(),
      dedent`
        <h1 id="hello-world"><a class="anchor" aria-hidden="true" tabindex="-1" href="#hello-world"><span class="icon icon-link"></span></a>Hello world</h1>
        <p>Here is a paragraph with a <a class="anchor" href="./foo">link</a></p>
      `
    )
  })

  test('only render allowed nodes', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))

    edge.use(edgeMarkdown, {
      allowed: ['h1', 'p'],
    })

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.render({
      content: dedent`
        # Hello world

        Here is a paragraph with a [link](./foo)
        `,
    })

    assert.equal(
      result.content.trim(),
      dedent`
        <h1 id="hello-world">Hello world</h1>
        <p>Here is a paragraph with a </p>
      `
    )
  })

  test('render markdown using the @markdown tag', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer.renderRaw(dedent`
      @markdown({
        content: \`# Hello world
Here is a paragraph with a [link](./foo)\`
      })
    `)

    assert.equal(
      result,
      dedent`
        <h1 id="hello-world"><a aria-hidden=true tabindex=-1 href="#hello-world"><span class="icon icon-link"></span></a>Hello world</h1>
        <p>Here is a paragraph with a <a href="./foo">link</a></p>
      `
    )
  })

  test('generate toc', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/gfm.mdc') })

    assert.snapshot(result.toc).match()
  })

  test('return empty string when there is no TOC', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.render({ content: `Hello world` })

    assert.equal(result.toc, '')
    assert.equal(result.content, '<p>Hello world</p>')
  })

  test('parse markdown with HTML', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer
      .getState()
      .$markdown.render({ file: join(import.meta.dirname, 'fixtures/raw_html.mdc') })

    assert.snapshot(result.content).match()
  })

  test('parse yaml frontmatter within components', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.render({
      file: join(import.meta.dirname, 'fixtures/front_matter_within_components.mdc'),
    })

    assert.snapshot(result.content).match()
  })

  test('extract frontmatter from a file', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const data = await renderer
      .getState()
      .$markdown.frontmatter({ file: join(import.meta.dirname, 'fixtures/front_matter.mdc') })

    assert.deepEqual(data, {
      title: 'Hello world',
      items: ['AdonisJS', 'Lucid', 'VineJS'],
    })
  })

  test('extract frontmatter from raw content', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const data = await renderer.getState().$markdown.frontmatter({
      content: dedent`
        ---
        title: Test doc
        draft: true
        ---

        # Hello
      `,
    })

    assert.deepEqual(data, { title: 'Test doc', draft: true })
  })

  test('render preview with content before first h2', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.preview({
      content: dedent`
        # Main title

        Intro paragraph

        ## First section

        Section content
      `,
    })

    assert.include(result.content, '<h1')
    assert.include(result.content, 'Intro paragraph')
    assert.notInclude(result.content, 'First section')
    assert.notInclude(result.content, 'Section content')
  })

  test('use h6 component to override h6 rendering', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.render({
      content: dedent`
        ###### Section title
        `,
    })

    assert.include(result.content, 'class="custom-h6"')
    assert.notMatch(result.content, /<h6(?! class="custom-h6")/)
  })

  test('use h5 component saved as H5.edge to override h5 rendering', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.render({
      content: dedent`
        ##### Section title
        `,
    })

    assert.include(result.content, 'class="custom-h5"')
    assert.notMatch(result.content, /<h5(?! class="custom-h5")/)
  })

  test('preview returns full content when there is no h2', async ({ assert }) => {
    const edge = new Edge()
    edge.mount(join(import.meta.dirname, 'fixtures/views'))
    edge.use(edgeMarkdown, {})

    const renderer = edge.share({})
    const result = await renderer.getState().$markdown.preview({
      content: dedent`
        # Main title

        Some content here

        More content
      `,
    })

    assert.include(result.content, 'Main title')
    assert.include(result.content, 'Some content here')
    assert.include(result.content, 'More content')
  })
})
