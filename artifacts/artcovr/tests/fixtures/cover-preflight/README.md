# Cover preflight image fixtures

These small image samples use synthetic gradients and colors, with no third-party
artwork. The valid JPEG, PNG, TIFF, GIF, and WebP images were generated with
ImageMagick 7; the embedded sRGB ICC profile was generated with Little CMS.
The TIFF is big-endian. The JPEG, PNG, and TIFF carry non-default orientation
metadata; the PNG uses an `eXIf` chunk. The animated GIF has two frames.

`truncated.jpg` is missing its JPEG end marker, and `truncated.png` is missing
its PNG `IEND` chunk. They intentionally retain enough headers for dimensions
to be readable.

The generated samples are included under the repository's MIT license.
