import {
  importDirectory,
  cleanupSVG,
  IconSet,
  runSVGO,
  parseColors,
  isEmptyColor,
  writeJSONFile,
  exportToDirectory,
} from '@iconify/tools'
import { getIconsCSS } from '@iconify/utils'

import SVGIcons2SVGFontStream, { Metadata } from 'svgicons2svgfont'
import svg2ttf from 'svg2ttf'
import ttf2eot from 'ttf2eot'
import ttf2woff from 'ttf2woff'
import ttf2woff2 from 'ttf2woff2'

import { kebabCase, pascalCase } from 'change-case'
import path from 'path'
import { mkdir, readFile, writeFile } from 'fs/promises'
import { createReadStream, createWriteStream } from 'fs'
import { rimraf } from 'rimraf'

await rimraf('./dist')
await mkdir('./dist')

const processIconSet = (iconSet: IconSet) =>
  iconSet.forEach((name, type) => {
    if (type != 'icon') return

    const svg = iconSet.toSVG(name)
    if (svg == null) {
      iconSet.remove(name)
      return
    }

    try {
      parseColors(svg, {
        defaultColor: 'currentColor',
        callback: (attr, colorStr, color) =>
          !color || isEmptyColor(color) ? colorStr : 'currentColor',
      })

      cleanupSVG(svg)

      runSVGO(svg)
    } catch (err: any) {
      console.error('error when parsing icon: ' + name)
      iconSet.remove(name)
    }

    iconSet.fromSVG(name, svg)
  })

const outlineIconSet = await importDirectory(
  path.resolve('.', 'icons/outline'),
  {
    includeSubDirs: true,
    prefix: 'ai-outline',
    keyword: async (file) => `${kebabCase(file.file)}`,
  }
)

await processIconSet(outlineIconSet)
await writeJSONFile('./dist/icon.outline.json', outlineIconSet.export())

const filledIconSet = await importDirectory(path.resolve('.', 'icons/filled'), {
  includeSubDirs: true,
  prefix: 'ai-filled',
  keyword: async (file) => `${kebabCase(file.file).replace('-fill', '')}`,
})

await processIconSet(filledIconSet)
await writeJSONFile('./dist/icon.filled.json', filledIconSet.export())

await mkdir('./dist/css')

const outlineCss = getIconsCSS(
  outlineIconSet.export(),
  Object.keys(outlineIconSet.entries),
  {
    iconSelector: `.{prefix}-{name}`,
    varName: 'aviala-svg-icon',
  }
)

await writeFile('./dist/css/aviala-icons.outline.css', outlineCss)

const filledCss = getIconsCSS(
  outlineIconSet.export(),
  Object.keys(outlineIconSet.entries),
  {
    iconSelector: `.{prefix}-{name}`,
    varName: 'aviala-svg-icon',
  }
)
await writeFile('./dist/css/aviala-icons.filled.css', filledCss)

const allCss = `${filledCss}\n\n${outlineCss}\n`
await writeFile('./dist/css/aviala-icons.css', allCss)

await writeFile('./dist/aviala-icons.css', allCss)

type Deferred<T> = Promise<T> & {
  resolve(value: T): void
  reject(err: any): void
}
const deferred = <T>() => {
  let resolve, reject

  const promise = new Promise<T>((resolveFn, rejectFn) => {
    ;[resolve, reject] = [resolveFn, rejectFn]
  }) as Deferred<T>

  promise.resolve = resolve!
  promise.reject = reject!

  return promise
}

const exportSvg = async (iconset: IconSet, name: string) => {
  await mkdir(path.resolve('.', 'dist', 'svg', name), {
    recursive: true,
  })

  return await exportToDirectory(iconset, {
    target: path.resolve('.', 'dist', 'svg', name),
  })
}

const exportIconfont = async (
  svgFiles: string[],
  fontName: string,
  filename: string,
  subfolder: string
) => {
  const filePath = path.resolve('./dist/fonts', subfolder)
  await mkdir(filePath, { recursive: true })

  const p = deferred<void>()

  const fontStream = new SVGIcons2SVGFontStream({
    fontName,
    fontHeight: 1920,
    fixedWidth: true,
    normalize: true,
    centerHorizontally: true,
    centerVertically: true,
  })

  fontStream
    .pipe(createWriteStream(path.resolve(filePath, `${filename}.svg`)))
    .on('finish', () => p.resolve())
    .on('error', (err) => p.reject(err))

  let charCode = 0xe614
  for (const glyph of svgFiles) {
    const glyphStream = createReadStream(path.resolve(glyph))
    ;(glyphStream as any).metadata = {
      name: pascalCase(path.basename(glyph).replace(path.extname(glyph), '')),
      unicode: [String.fromCharCode(charCode)],
    }
    fontStream.write(glyphStream)
    charCode += 1
  }

  fontStream.end()

  await p
  const content = await readFile(
    path.resolve(filePath, `${filename}.svg`),
    'utf8'
  )
  const ttf = svg2ttf(content).buffer
  const eot = ttf2eot(ttf)
  const woff = ttf2woff(ttf)
  const woff2 = ttf2woff2(Buffer.from(ttf.buffer))

  await Promise.all([
    writeFile(path.resolve(filePath, `${filename}.ttf`), ttf),
    writeFile(path.resolve(filePath, `${filename}.eot`), eot),
    writeFile(path.resolve(filePath, `${filename}.woff`), woff),
    writeFile(path.resolve(filePath, `${filename}.woff2`), woff2),
  ])
}

await exportIconfont(
  await exportSvg(filledIconSet, 'filled'),
  'Aviala Icons Filled',
  'AvialaIconsFilled',
  'filled'
)

await exportIconfont(
  await exportSvg(outlineIconSet, 'outline'),
  'Aviala Icons Outline',
  'AvialaIconsOutline',
  'outline'
)

export {}
