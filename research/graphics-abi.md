# Recovered original rendering behavior

Static evidence from `research/Knights`, symbol map `research/macho.json`, and Capstone disassembly. Investigation stopped when the user chose native JavaScript; retain these semantics as rewrite references, not a delivered emulator design.

## Coordinates and surfaces

- Game-space drawing uses ordinary **x then y** in a 480×320 landscape plane. The iOS startup code at `0x4a48–0x4b78` performs portrait projection and device rotation: `glOrthof(320,0,0,480,-1,1)`, then translate `(160,240)`, rotate `-90°`, translate `(-240,-160)`. A landscape browser canvas should use game coordinates directly.
- `myRect` is **four signed int16 values: top, left, bottom, right**. `Display::Blit` at `0x7bf4` converts this to crop `(left,top,right-left,bottom-top)`; no x/y swap is required after decoding that layout.
- `Surface` is 20 bytes: texture pointer `+4`, path object `+8`, integer content width `+12`, content height `+16`. `GetWidth` `0x8dfc` / `GetHeight` `0x8e04` return those fields directly.
- `Surface::LoadImage` at `0x8e50`: boolean true selects `.jpg`, false selects `.png`. Content dimensions equal `pixelsWide*maxS` and `pixelsHigh*maxT`, truncated to integer. Hardware texture dimensions are padded powers of two, distinct from image content dimensions.

## Drawing semantics

At C++ entry, r0 is `this`; float values are bit patterns in core registers/stack, not hard-float arguments. Below `sp` means entry stack pointer.

| Entry | Arguments after `this` | Behavior |
| --- | --- | --- |
| `0x7b10 BlitStretch` | r1=x1,r2=y1,r3=x2,sp0=y2,sp4=surface | Destination rectangle `(x1,y1,x2-x1,y2-y1)`; corners, not width/height inputs. |
| `0x7bf4 Blit` | r1=x,r2=y,r3=surface,sp0=rect,sp4=bool,sp8=sx,sp12=sy | **Top-left** placement. If crop nonnull, destination size is crop width×sx,height×sy. Boolean is **skip texture bind**, not flip. If crop null, scales are ignored and full content dimensions are used. |
| `0x7dc4 BlitScaled` | r1=cx,r2=cy,r3=sx,sp0=sy,sp4=surface | **Centered** placement: `(cx-w*sx/2,cy-h*sy/2,w*sx,h*sy)`. |
| `0x7fec BlitRotated` | r1=cx,r2=cy,r3=radians,sp0=surface,sp4=skipBind | Translate to center, rotate radians×180/3.141592 around +Z, draw centered unscaled. |
| `0x8188 BlitRotatedScale` | r1=cx,r2=cy,r3=radians,sp0=sx,sp4=sy,sp8=surface,sp12=skipBind | Centered scaled rectangle under translation and rotation. |
| `0x80b4 Blit4Points` | r1=x0,r2=y0,r3=x1,sp0=y1,sp4=x2,sp8=y2,sp12=x3,sp16=y3,sp20=uOffset,sp24=vOffset,sp28=surface | Four supplied vertices form a triangle strip; texture-coordinate offsets are normalized, not pixel crop coordinates. |

`Texture2D BlitAtPointFlip:::` (`0x96c8`) is the actual full-image flip method: Objective-C r0=self,r1=selector,r2=x,r3=y,sp0=flipX,sp4=flipY. It reverses destination vertex x/y positions independently. Cropped blit's boolean does **not** do this.

All normal texture strips use vertex order `(x,y),(x+w,y),(x,y+h),(x+w,y+h)`. `BlitAtPoint::` (`0x9934`), `drawAtPoint::` (`0x9a70`, centered), and cropped `BlitAtPointUsingRect:::::` (`0x9454`) map source UV increasing downward across those vertices. `drawInRect::` (`0x95a0`) and `draw4Points::::::` (`0x9818`) instead use vertically inverted UV order. Preserve this verified difference when matching screenshots; final browser source-image orientation still needs visual comparison.

## Font metrics and spacing

`hgeFont` allocation size is `0x1428`. Constructor at `0x8820` (wrapper `0x8de8`) takes r0=this,r1=C-string resource name,r2=bool. It opens name`.fnt`, loads `Bitmap=` PNG, and parses HGEFONT `Char=code,x,y,w,h,pre,post`. **This build ignores both parsed pre/post values and writes zero to both spacing arrays.** Quoted character or hexadecimal byte codes are accepted.

| Offset | Content/default |
| --- | --- |
| `0x400` | Font Surface pointer |
| `0x404 + byte*8` | `myRect` glyph crop: top=y,left=x,bottom=y+h,right=x+w |
| `0xc04 + byte*4` | Float pre-spacing, initialized to 0 |
| `0x1004 + byte*4` | Float post-spacing, initialized to 0 |
| `0x1404` | Float font height = maximum glyph h |
| `0x1408` | Float scale, default 1 |
| `0x140c` | Float horizontal advance proportion, default 1 |
| `0x1410` | Float initialized 0, not read by examined Render |
| `0x1414` | Float tracking, default 0; **InitGame overwrites to -16.0** |
| `0x1418` | Float line spacing multiplier, default 1 |
| `0x141c` | Word initialized `0xffffffff`, not read by examined Render |
| `0x1420` | Float initialized 0.5, not read by examined Render |

`InitGame` (`0x7114–0x71c0`) constructs **font_interface**, writes tracking -16 at `0x7198–0x71a4`, and assigns the same object to FontInterface, Font1, and FontLarge. Real asset `dist/assets/font_interface.fnt` has 27-pixel glyph height and 512×256 bitmap. Its supplied pre/post values must not be used as if the original constructor honored them.

`GetStringWidth` (`0x8314`): r0=this,r1=text; float result bits return in r0. Per line, sum `(glyphWidth + pre + post + tracking)`; take maximum against initial 0; return max×scale×proportion. Invalid/empty glyph falls back to **'?'**. LF ends a line; immediately following CR/LF runs are skipped. CR inside a non-LF-terminated line is not independently recognized as a line break.

`Render` (`0x850c`): r0=this,r1=x,r2=y,r3=alignment,sp0=text. Only low two alignment bits matter: 0/3 left,1 right (`x-width`),2 center (`x-trunc(width*0.5)`). Width is maximum of the entire remaining string, not only current line. On LF: `y += trunc(height*scale*lineSpacing)` and alignment is recalculated against remaining text.

Per non-LF glyph:

1. If invalid crop, substitute **space** (different from width helper).
2. For space or substituted missing glyph, advance x by **5 unscaled pixels**.
3. Advance x by `pre*scale*proportion`.
4. Draw cropped glyph top-left at x,y, scaled by `scale` in both axes; **proportion changes advances, not drawn glyph width**.
5. Advance x by `(glyphWidth+post+tracking)*scale*proportion`.

This means space's measured width and rendered advance differ by 5 pixels in this build. Preserve it if matching original layout exactly.

Color overload `0x879c`: same first arguments; sp0=text,sp4=red,sp8=green,sp12=blue, taking low byte of each channel. Color structure therefore occupies three 32-bit argument slots here. Alpha comes from Display+0x10. It applies RGB around the text render then restores white RGB with the same alpha.

## Color / blending

- `Display::SetBlending` (`0x7fc8`) stores its integer argument at Display+0x10 and sends white RGB with its low byte as GL alpha.
- Normal mode (`0x7d20`): `SRC_ALPHA, ONE_MINUS_SRC_ALPHA`.
- No-black-edges mode (`0x7d04`): `ONE, ONE_MINUS_SRC_ALPHA`.
- Add mode (`0x7d40`): **`ONE, ONE_MINUS_SRC_COLOR`**, not the usual `SRC_ALPHA,ONE`. `BlitAdd` temporarily selects this then resets normal mode.

No runtime code was changed, and geometry/font conclusions have not yet been validated against a browser screenshot.
