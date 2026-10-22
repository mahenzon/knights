# Original framebuffer investigation

The ARM rendering dispatch (`-[CrashLandingAppDelegate renderScene]`, 0x51bc) calls
the current game mode Draw and `-[MyEAGLView swapBuffers]`. The latter presents
the existing color renderbuffer via `presentRenderbuffer:` at 0x5d98. Neither
path clears it. The binary imports no `glClear` or `glClearColor`.

`-[MyEAGLView initWithCoder:]` calls `numberWithBool:NO` at 0x5b80 and constructs
`dictionaryWithObjectsAndKeys:` at 0x5bc4. Mach-O indirect-symbol resolution gives
0xc73d8 = `kEAGLDrawablePropertyRetainedBacking`, 0xc73dc =
`kEAGLColorFormatRGB565`, and 0xc73e0 = `kEAGLDrawablePropertyColorFormat`.
The dictionary therefore explicitly disables retained backing and uses RGB565.
Selector references also confirm `setDrawableProperties:` at 0x5bd4.

The translated native sky covers exactly the logical 480x320 rectangle.
Consequently uncovered pixels during shake are not specified by game drawing
commands: their appearance depends on the historical EAGL driver/presentation
behavior. This evidence does not establish either a retained previous frame or
an enlarged background. The browser's flat `#9fbea2` fill remains a known visual
approximation. Do not claim it is a 1:1 reproduction or alter the world coverage
without additional original-device/framebuffer evidence.

Static disassembly: `framebuffer-disassembly.txt`, `world-loop-disassembly.txt`.
This investigation makes no production renderer change.
