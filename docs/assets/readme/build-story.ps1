# Rebuild the original explanatory illustration. No app screenshots are altered.
Add-Type -AssemblyName System.Drawing
$assetRoot = $PSScriptRoot
$frames = Join-Path ([IO.Path]::GetTempPath()) ('second-eye-story-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $frames | Out-Null
$ink = [Drawing.ColorTranslator]::FromHtml('#172C39')
$muted = [Drawing.ColorTranslator]::FromHtml('#526878')
$red = [Drawing.ColorTranslator]::FromHtml('#C74438')
$amber = [Drawing.ColorTranslator]::FromHtml('#A36B16')
$green = [Drawing.ColorTranslator]::FromHtml('#24775B')
$paper = [Drawing.ColorTranslator]::FromHtml('#F5F3ED')
function Write-Label($canvas, $text, $size, $x, $y, $color, $bold = $false) {
    $style = if ($bold) { [Drawing.FontStyle]::Bold } else { [Drawing.FontStyle]::Regular }
    $font = New-Object Drawing.Font('Segoe UI', $size, $style, [Drawing.GraphicsUnit]::Pixel)
    $brush = New-Object Drawing.SolidBrush($color)
    $canvas.DrawString($text, $font, $brush, $x, $y)
    $brush.Dispose(); $font.Dispose()
}
$titles = @('One wall. Two versions.', 'The mismatch becomes visible.', 'Sent does not mean settled.', 'Confirm the revision. Recheck.')
$lines = @(
    @('The office records a change.', 'The crew plans from the old line.'),
    @('A red ghost marks the old line.', 'The source messages explain why.'),
    @('The superintendent sends a correction.', 'Amber means a reply is still pending.'),
    @('The simulated crew confirms receipt.', 'The record is checked again.')
)
for ($i = 0; $i -lt 4; $i++) {
    $bmp = New-Object Drawing.Bitmap(1200, 520)
    $g = [Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.Clear($paper)
    Write-Label $g 'SECOND EYE  /  THE GHOST WALL' 17 48 32 $muted $true
    Write-Label $g $titles[$i] 35 48 88 $ink $true
    Write-Label $g $lines[$i][0] 22 48 158 $ink
    Write-Label $g $lines[$i][1] 22 48 193 $ink
    Write-Label $g 'See tomorrow''s mistake' 28 48 288 $ink $true
    Write-Label $g 'before it gets built.' 28 48 328 $ink $true
    $grid = New-Object Drawing.Pen([Drawing.ColorTranslator]::FromHtml('#E3E4DE'), 1)
    for ($x = 650; $x -le 1140; $x += 28) { $g.DrawLine($grid, $x, 90, $x, 390) }
    for ($y = 90; $y -le 390; $y += 28) { $g.DrawLine($grid, 650, $y, 1140, $y) }
    $wall = New-Object Drawing.Pen($ink, 9)
    $g.DrawLine($wall, 704, 140, 1030, 140)
    $g.DrawLine($wall, 704, 140, 704, 350)
    $g.DrawLine($wall, 704, 350, 1030, 350)
    $g.DrawLine($wall, 1030, 140, 1030, 350)
    Write-Label $g 'UNIT 204' 17 755 225 $muted $true
    $accent = if ($i -eq 2) { $amber } elseif ($i -eq 3) { $green } else { $red }
    $ghost = New-Object Drawing.Pen($accent, 5)
    $ghost.DashStyle = [Drawing.Drawing2D.DashStyle]::Dash
    if ($i -lt 3) {
        $g.DrawLine($ghost, 960, 140, 960, 350)
        Write-Label $g '40 cm' 24 943 91 $accent $true
    } else {
        $g.DrawEllipse((New-Object Drawing.Pen($green, 4)), 1080, 225, 36, 36)
        Write-Label $g '+' 26 1087 225 $green $true
    }
    $status = @('OLD LINE / LATEST RECORD', 'RISK FOUND', 'AWAITING CONFIRMATION', 'RECORD RECHECKED')[$i]
    Write-Label $g $status 17 704 405 $accent $true
    for ($j = 0; $j -lt 4; $j++) {
        $b = New-Object Drawing.SolidBrush($(if ($j -eq $i) { $ink } else { [Drawing.ColorTranslator]::FromHtml('#D9DED9') }))
        $g.FillRectangle($b, (48 + $j * 45), 408, 34, 4); $b.Dispose()
    }
    Write-Label $g 'Simulated site data  |  Explanatory illustration, not an app recording. Geometry not to scale.' 15 48 469 $muted
    $bmp.Save((Join-Path $frames ("frame{0}.png" -f $i)), [Drawing.Imaging.ImageFormat]::Png)
    if ($i -eq 1) { $bmp.Save((Join-Path $assetRoot 'ghost-story.png'), [Drawing.Imaging.ImageFormat]::Png) }
    $g.Dispose(); $bmp.Dispose(); $grid.Dispose(); $wall.Dispose(); $ghost.Dispose()
}
# Four calm, three-second panels. Plays once rather than looping indefinitely.
& ffmpeg -hide_banner -loglevel error -y -framerate 1/3 -i (Join-Path $frames 'frame%d.png') -filter_complex '[0:v]split[a][b];[a]palettegen[p];[b][p]paletteuse' -loop -1 (Join-Path $assetRoot 'ghost-story.gif')
if ($LASTEXITCODE -ne 0) { throw 'GIF export failed' }
Write-Output 'Created ghost-story.gif and ghost-story.png'
