// Re-encodes the iOS app icons without an alpha channel (App Store rejects icons that have one).
// Run by `pnpm icons` after `tauri icon`; the icons are already opaque, so pixels do not change.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

for path in CommandLine.arguments.dropFirst() {
    let url = URL(fileURLWithPath: path) as CFURL
    guard let src = CGImageSourceCreateWithURL(url, nil), let img = CGImageSourceCreateImageAtIndex(src, 0, nil) else { fatalError(path) }
    let ctx = CGContext(data: nil, width: img.width, height: img.height, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
    ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1))
    ctx.fill(CGRect(x: 0, y: 0, width: img.width, height: img.height))
    ctx.draw(img, in: CGRect(x: 0, y: 0, width: img.width, height: img.height))
    let dest = CGImageDestinationCreateWithURL(url, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, ctx.makeImage()!, nil)
    precondition(CGImageDestinationFinalize(dest))
}
