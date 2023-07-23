import canvas = require('canvas')

export interface VcsOptions {
    images: (canvas.Image | canvas.Canvas)[],
    background: string,
    textColor: string,
    textShadow: string,
    thumbnailsPadding: number,
    thumbnailsMargin: number,
    thumbnailsBorder: number,
    font: string,
    columns: number,
    rows: number,
    videoInfo: string,
    progressUpdate: (progress: number) => void
}

const sum = (a: number, b: number) => a + b

export async function generateVcs({
    images,
    background,
    textColor,
    textShadow,
    thumbnailsPadding,
    thumbnailsMargin,
    thumbnailsBorder,
    font,
    columns,
    rows,
    videoInfo,
    progressUpdate
}: VcsOptions): Promise<canvas.Canvas> {
    progressUpdate(0)
    const columnSizes = Array(columns).fill(0).map((_, col) => {
        let max = 0
        for (let row = 0; row < rows; row++) {
            max = Math.max(images[col + row * columns].width, max)
        }
        return max
    })
    const rowSizes = Array(rows).fill(0).map((_, row) => {
        let max = 0
        for (let col = 0; col < columns; col++) {
            max = Math.max(images[col + row * columns].height, max)
        }
        return max
    })

    const cv = canvas.createCanvas(
        columnSizes.reduce(sum) + thumbnailsMargin * (columns + 1),
        rowSizes.reduce(sum) + thumbnailsMargin * (rows + 1)
    )
    const ctx = cv.getContext('2d')

    ctx.strokeStyle = 'transparent'
    ctx.fillStyle = background
    ctx.fillRect(0, 0, cv.width, cv.height)

    for (let i = 0; i < images.length; i++) {
        const col = i % columns
        const row = (i - col) / columns
        const imgPosX = (col > 0 ? columnSizes.slice(0, col).reduce(sum) : 0) + thumbnailsMargin * (col + 1)
        const imgPosY = (row > 0 ? rowSizes.slice(0, row).reduce(sum) : 0) + thumbnailsMargin * (row + 1)
        ctx.drawImage(images[i], imgPosX, imgPosY)
        progressUpdate((i + 1) / (images.length + 1))
    }

    ctx.font = font
    ctx.fillStyle = textShadow
    drawText(ctx, videoInfo, thumbnailsMargin + thumbnailsBorder + thumbnailsPadding + 1, thumbnailsMargin + thumbnailsBorder + thumbnailsPadding + 1, 1.5, 'left', 'top')
    ctx.fillStyle = textColor
    drawText(ctx, videoInfo, thumbnailsMargin + thumbnailsBorder + thumbnailsPadding, thumbnailsMargin + thumbnailsBorder + thumbnailsPadding, 1.5, 'left', 'top')

    return cv
}

export interface ThumbnailOptions {
    thumbnailSize: number
    thumbnailBorder: number
    thumbnailBorderColor: string
    thumbnailPadding: number
    timestamp: string
    textColor: string
    textShadow: string
    font: string
}

export async function prepareThumbnail(image: canvas.Image | canvas.Canvas | null, {
    thumbnailSize,
    thumbnailBorder,
    thumbnailBorderColor,
    thumbnailPadding,
    timestamp,
    textColor,
    textShadow,
    font
}: ThumbnailOptions) {
    if (image == null) {
        image = await new Promise<canvas.Image>((resolve, reject) => {
            const img = new canvas.Image()
            img.onload = () => {
                resolve(img)
            }
            img.onerror = (err) => {
                reject(err)
            }
            img.src = `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="${thumbnailSize}" height="${thumbnailSize}" style="fill-rule:evenodd;clip-rule:evenodd;stroke-linecap:round;stroke-linejoin:round;stroke-miterlimit:1.5" viewBox="0 0 100 100"><circle cx="50" cy="50" r="41" style="fill:none;stroke:#9b1f1f;stroke-width:10px"/><path d="m21.014 78.986 57.972-57.972" style="fill:none;stroke:#9b1f1f;stroke-width:10px"/></svg>`).toString('base64')}`
        })
    }
    const ratio = Math.min(thumbnailSize / image.width, thumbnailSize / image.height)
    const newWidth = Math.ceil(image.width * ratio)
    const newHeight = Math.ceil(image.height * ratio)
    const cv = canvas.createCanvas(newWidth + thumbnailBorder * 2, newHeight + thumbnailBorder * 2)
    const ctx = cv.getContext('2d')
    ctx.fillStyle = thumbnailBorderColor
    ctx.fillRect(0, 0, cv.width, cv.height)
    ctx.drawImage(image, thumbnailBorder, thumbnailBorder, newWidth, newHeight)
    ctx.font = font
    ctx.fillStyle = textShadow
    drawText(ctx, timestamp, newWidth - thumbnailBorder - thumbnailPadding, newHeight - thumbnailBorder - thumbnailPadding, 1.5, 'right', 'baseline')
    ctx.fillStyle = textColor
    drawText(ctx, timestamp, newWidth - thumbnailBorder - thumbnailPadding - 1, newHeight - thumbnailBorder - thumbnailPadding - 1, 1.5, 'right', 'baseline')
    return cv
}

function drawText(ctx: canvas.CanvasRenderingContext2D, text: string, x: number, y: number, lineHeight: number, horizontalAlignment: 'left' | 'right', verticalLineAlignment: 'top' | 'baseline' = 'baseline') {
    const sizeRef = ctx.measureText("M")
    const baseOffsetY = verticalLineAlignment === 'top' ? sizeRef.actualBoundingBoxAscent : 0
    const actualLineHeight = (Math.abs(sizeRef.actualBoundingBoxAscent) + Math.abs(sizeRef.actualBoundingBoxDescent)) * lineHeight
    const lines = text.split('\n')

    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], x + (horizontalAlignment === 'right' ? -ctx.measureText(lines[i]).width : 0), y + baseOffsetY + actualLineHeight * (verticalLineAlignment === 'top' ? i : (lines.length - i - 1)))
    }
}