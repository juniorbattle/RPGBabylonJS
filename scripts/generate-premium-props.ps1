Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$decorRoot = Join-Path $projectRoot "public/assets/decorations"

$folders = @("ruins", "altar", "torch", "statue")
foreach ($folder in $folders) {
    $path = Join-Path $decorRoot $folder
    New-Item -ItemType Directory -Force -Path $path | Out-Null
}

function New-Canvas {
    param(
        [int]$Width = 512,
        [int]$Height = 512
    )

    $bmp = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::FromArgb(0, 0, 0, 0))

    return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-Canvas {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [System.Drawing.Graphics]$Graphics,
        [string]$Path
    )

    $Graphics.Dispose()
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $Bitmap.Dispose()
}

function Draw-SoftShadow {
    param(
        [System.Drawing.Graphics]$Graphics,
        [double]$X,
        [double]$Y,
        [double]$Width,
        [double]$Height
    )

    for ($i = 0; $i -lt 5; $i++) {
        $alpha = [Math]::Max(8, 42 - ($i * 8))
        $grow = $i * 8
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, 0, 0, 0))
        $Graphics.FillEllipse($brush, [float]($X - $grow), [float]($Y - ($grow * 0.2)), [float]($Width + ($grow * 2)), [float]($Height + $grow))
        $brush.Dispose()
    }
}

function Draw-StoneNoise {
    param(
        [System.Drawing.Graphics]$Graphics,
        [System.Random]$Rng,
        [int]$X,
        [int]$Y,
        [int]$W,
        [int]$H
    )

    for ($i = 0; $i -lt 80; $i++) {
        $nx = $X + $Rng.Next(0, [Math]::Max(1, $W))
        $ny = $Y + $Rng.Next(0, [Math]::Max(1, $H))
        $nw = 2 + $Rng.Next(0, 5)
        $nh = 2 + $Rng.Next(0, 5)
        $v = 90 + $Rng.Next(0, 80)
        $a = 25 + $Rng.Next(0, 45)
        $b = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($a, $v, $v, $v))
        $Graphics.FillRectangle($b, $nx, $ny, $nw, $nh)
        $b.Dispose()
    }
}

function Draw-CrackLines {
    param(
        [System.Drawing.Graphics]$Graphics,
        [System.Random]$Rng,
        [int]$X,
        [int]$Y,
        [int]$W,
        [int]$H
    )

    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 28, 28, 30), 2)
    for ($i = 0; $i -lt 10; $i++) {
        $x1 = $X + $Rng.Next(0, [Math]::Max(1, $W))
        $y1 = $Y + $Rng.Next(0, [Math]::Max(1, $H))
        $x2 = $x1 + $Rng.Next(-20, 20)
        $y2 = $y1 + $Rng.Next(8, 30)
        $Graphics.DrawLine($pen, $x1, $y1, $x2, $y2)
    }
    $pen.Dispose()
}

function Draw-Ruin {
    param([string]$OutPath, [int]$Variant)

    $ctx = New-Canvas
    $bmp = $ctx.Bitmap
    $g = $ctx.Graphics
    $rng = [System.Random]::new(1000 + ($Variant * 11))

    $stone = [System.Drawing.Color]::FromArgb(255, 124, 124, 130)
    $edge = [System.Drawing.Color]::FromArgb(180, 68, 68, 74)
    $moss = [System.Drawing.Color]::FromArgb(120, 76, 108, 70)

    Draw-SoftShadow -Graphics $g -X 120 -Y 430 -Width 280 -Height 54

    switch ($Variant) {
        1 {
            $b1 = New-Object System.Drawing.SolidBrush $stone
            $p1 = New-Object System.Drawing.Pen $edge, 3
            $g.FillRectangle($b1, 110, 180, 74, 230)
            $g.FillRectangle($b1, 320, 180, 74, 230)
            $g.FillRectangle($b1, 130, 130, 250, 64)
            $g.DrawRectangle($p1, 110, 180, 74, 230)
            $g.DrawRectangle($p1, 320, 180, 74, 230)
            $g.DrawRectangle($p1, 130, 130, 250, 64)
            $b1.Dispose()
            $p1.Dispose()
            Draw-StoneNoise -Graphics $g -Rng $rng -X 108 -Y 128 -W 286 -H 282
            Draw-CrackLines -Graphics $g -Rng $rng -X 112 -Y 132 -W 280 -H 278
        }
        2 {
            $b1 = New-Object System.Drawing.SolidBrush $stone
            $p1 = New-Object System.Drawing.Pen $edge, 3
            $g.FillRectangle($b1, 146, 250, 210, 158)
            $g.DrawRectangle($p1, 146, 250, 210, 158)
            $g.FillRectangle($b1, 268, 158, 62, 250)
            $g.DrawRectangle($p1, 268, 158, 62, 250)
            $poly = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(142, 248),
                [System.Drawing.PointF]::new(206, 190),
                [System.Drawing.PointF]::new(256, 236),
                [System.Drawing.PointF]::new(220, 248)
            )
            $g.FillPolygon($b1, $poly)
            $g.DrawPolygon($p1, $poly)
            $b1.Dispose()
            $p1.Dispose()
            Draw-StoneNoise -Graphics $g -Rng $rng -X 144 -Y 156 -W 216 -H 256
            Draw-CrackLines -Graphics $g -Rng $rng -X 148 -Y 158 -W 206 -H 248
        }
        3 {
            $b1 = New-Object System.Drawing.SolidBrush $stone
            $p1 = New-Object System.Drawing.Pen $edge, 3
            $g.FillRectangle($b1, 94, 210, 94, 198)
            $g.FillRectangle($b1, 324, 210, 94, 198)
            $g.FillRectangle($b1, 94, 160, 324, 54)
            $g.DrawRectangle($p1, 94, 210, 94, 198)
            $g.DrawRectangle($p1, 324, 210, 94, 198)
            $g.DrawRectangle($p1, 94, 160, 324, 54)
            $archGlow = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(52, 120, 170, 220))
            $g.FillEllipse($archGlow, 176, 194, 156, 180)
            $archGlow.Dispose()
            $b1.Dispose()
            $p1.Dispose()
            Draw-StoneNoise -Graphics $g -Rng $rng -X 92 -Y 158 -W 330 -H 252
            Draw-CrackLines -Graphics $g -Rng $rng -X 96 -Y 162 -W 322 -H 244
        }
        default {
            $b1 = New-Object System.Drawing.SolidBrush $stone
            $p1 = New-Object System.Drawing.Pen $edge, 3
            $base = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(140, 418),
                [System.Drawing.PointF]::new(364, 418),
                [System.Drawing.PointF]::new(332, 356),
                [System.Drawing.PointF]::new(166, 356)
            )
            $obelisk = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(244, 132),
                [System.Drawing.PointF]::new(302, 356),
                [System.Drawing.PointF]::new(224, 356),
                [System.Drawing.PointF]::new(196, 220)
            )
            $g.FillPolygon($b1, $base)
            $g.DrawPolygon($p1, $base)
            $g.FillPolygon($b1, $obelisk)
            $g.DrawPolygon($p1, $obelisk)
            $b1.Dispose()
            $p1.Dispose()
            Draw-StoneNoise -Graphics $g -Rng $rng -X 138 -Y 128 -W 228 -H 294
            Draw-CrackLines -Graphics $g -Rng $rng -X 142 -Y 132 -W 220 -H 286
        }
    }

    for ($i = 0; $i -lt 8; $i++) {
        $mBrush = New-Object System.Drawing.SolidBrush $moss
        $mx = 100 + $rng.Next(0, 300)
        $my = 190 + $rng.Next(0, 210)
        $mw = 12 + $rng.Next(0, 28)
        $mh = 8 + $rng.Next(0, 20)
        $g.FillEllipse($mBrush, $mx, $my, $mw, $mh)
        $mBrush.Dispose()
    }

    Save-Canvas -Bitmap $bmp -Graphics $g -Path $OutPath
}

function Draw-Altar {
    param([string]$OutPath, [int]$Variant)

    $ctx = New-Canvas
    $bmp = $ctx.Bitmap
    $g = $ctx.Graphics
    $rng = [System.Random]::new(2000 + ($Variant * 13))

    $stone = [System.Drawing.Color]::FromArgb(255, 142, 138, 132)
    $edge = [System.Drawing.Color]::FromArgb(180, 72, 68, 66)
    $glowColors = @(
        [System.Drawing.Color]::FromArgb(120, 88, 180, 255),
        [System.Drawing.Color]::FromArgb(120, 120, 255, 190),
        [System.Drawing.Color]::FromArgb(120, 255, 155, 90),
        [System.Drawing.Color]::FromArgb(120, 212, 146, 255)
    )
    $glow = $glowColors[($Variant - 1) % $glowColors.Count]

    Draw-SoftShadow -Graphics $g -X 132 -Y 432 -Width 250 -Height 52

    $b = New-Object System.Drawing.SolidBrush $stone
    $p = New-Object System.Drawing.Pen $edge, 3

    $g.FillRectangle($b, 118, 356, 276, 64)
    $g.DrawRectangle($p, 118, 356, 276, 64)
    $g.FillRectangle($b, 146, 308, 220, 52)
    $g.DrawRectangle($p, 146, 308, 220, 52)
    $g.FillRectangle($b, 176, 268, 164, 40)
    $g.DrawRectangle($p, 176, 268, 164, 40)

    if ($Variant -eq 2) {
        $g.FillRectangle($b, 236, 180, 42, 88)
        $g.DrawRectangle($p, 236, 180, 42, 88)
    } elseif ($Variant -eq 3) {
        $poly = [System.Drawing.PointF[]]@(
            [System.Drawing.PointF]::new(204, 270),
            [System.Drawing.PointF]::new(256, 186),
            [System.Drawing.PointF]::new(308, 270)
        )
        $g.FillPolygon($b, $poly)
        $g.DrawPolygon($p, $poly)
    } elseif ($Variant -eq 4) {
        $g.FillEllipse($b, 218, 212, 74, 56)
        $g.DrawEllipse($p, 218, 212, 74, 56)
    }

    $b.Dispose()
    $p.Dispose()

    for ($ring = 0; $ring -lt 4; $ring++) {
        $alpha = [Math]::Max(20, 120 - ($ring * 26))
        $r = 78 - ($ring * 12)
        $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, $glow.R, $glow.G, $glow.B))
        $g.FillEllipse($brush, 256 - $r, 287 - ($r * 0.52), $r * 2, $r * 1.05)
        $brush.Dispose()
    }

    Draw-StoneNoise -Graphics $g -Rng $rng -X 116 -Y 178 -W 282 -H 246
    Draw-CrackLines -Graphics $g -Rng $rng -X 120 -Y 182 -W 274 -H 238

    Save-Canvas -Bitmap $bmp -Graphics $g -Path $OutPath
}

function Draw-Torch {
    param([string]$OutPath, [int]$Variant)

    $ctx = New-Canvas
    $bmp = $ctx.Bitmap
    $g = $ctx.Graphics
    $rng = [System.Random]::new(3000 + ($Variant * 17))

    Draw-SoftShadow -Graphics $g -X 204 -Y 438 -Width 106 -Height 38

    $woodA = [System.Drawing.Color]::FromArgb(255, 98, 68, 44)
    $woodB = [System.Drawing.Color]::FromArgb(255, 76, 52, 34)
    $metal = [System.Drawing.Color]::FromArgb(255, 134, 136, 146)

    $poleBrush = New-Object System.Drawing.SolidBrush $woodA
    $polePen = New-Object System.Drawing.Pen $woodB, 2
    $x = 244 + (($Variant - 2) * 8)
    $g.FillRectangle($poleBrush, $x, 164, 24, 248)
    $g.DrawRectangle($polePen, $x, 164, 24, 248)

    $bandBrush = New-Object System.Drawing.SolidBrush $metal
    $g.FillRectangle($bandBrush, $x - 6, 212, 36, 12)
    $g.FillRectangle($bandBrush, $x - 6, 280, 36, 10)
    $g.FillEllipse($bandBrush, $x - 18, 132, 60, 50)

    $flameOuter = @(
        [System.Drawing.Color]::FromArgb(180, 255, 124, 48),
        [System.Drawing.Color]::FromArgb(180, 255, 146, 64),
        [System.Drawing.Color]::FromArgb(180, 255, 108, 44),
        [System.Drawing.Color]::FromArgb(180, 255, 176, 72)
    )[($Variant - 1) % 4]
    $flameInner = [System.Drawing.Color]::FromArgb(210, 255, 232, 132)

    for ($i = 0; $i -lt 5; $i++) {
        $alpha = [Math]::Max(22, 140 - ($i * 25))
        $r = 82 - ($i * 14)
        $glowBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($alpha, $flameOuter.R, $flameOuter.G, $flameOuter.B))
        $g.FillEllipse($glowBrush, 256 - $r, 142 - ($r * 0.55), $r * 2, $r * 1.25)
        $glowBrush.Dispose()
    }

    $outerBrush = New-Object System.Drawing.SolidBrush $flameOuter
    $innerBrush = New-Object System.Drawing.SolidBrush $flameInner
    $flamePts = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(256, 76),
        [System.Drawing.PointF]::new(292, 150),
        [System.Drawing.PointF]::new(270, 196),
        [System.Drawing.PointF]::new(244, 188),
        [System.Drawing.PointF]::new(220, 150)
    )
    $innerPts = [System.Drawing.PointF[]]@(
        [System.Drawing.PointF]::new(256, 102),
        [System.Drawing.PointF]::new(278, 158),
        [System.Drawing.PointF]::new(258, 176),
        [System.Drawing.PointF]::new(238, 158)
    )
    $g.FillPolygon($outerBrush, $flamePts)
    $g.FillPolygon($innerBrush, $innerPts)

    for ($s = 0; $s -lt 16; $s++) {
        $sparkBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(110 + $rng.Next(0, 100), 255, 196, 96))
        $sx = 218 + $rng.Next(0, 74)
        $sy = 60 + $rng.Next(0, 76)
        $sw = 2 + $rng.Next(0, 4)
        $g.FillEllipse($sparkBrush, $sx, $sy, $sw, $sw)
        $sparkBrush.Dispose()
    }

    $outerBrush.Dispose()
    $innerBrush.Dispose()
    $poleBrush.Dispose()
    $polePen.Dispose()
    $bandBrush.Dispose()

    Save-Canvas -Bitmap $bmp -Graphics $g -Path $OutPath
}

function Draw-Statue {
    param([string]$OutPath, [int]$Variant)

    $ctx = New-Canvas
    $bmp = $ctx.Bitmap
    $g = $ctx.Graphics
    $rng = [System.Random]::new(4000 + ($Variant * 19))

    Draw-SoftShadow -Graphics $g -X 130 -Y 438 -Width 252 -Height 52

    $stone = [System.Drawing.Color]::FromArgb(255, 136, 138, 146)
    $edge = [System.Drawing.Color]::FromArgb(170, 74, 78, 88)
    $patina = @(
        [System.Drawing.Color]::FromArgb(90, 88, 132, 110),
        [System.Drawing.Color]::FromArgb(90, 120, 116, 152),
        [System.Drawing.Color]::FromArgb(90, 104, 140, 156),
        [System.Drawing.Color]::FromArgb(90, 130, 118, 100)
    )[($Variant - 1) % 4]

    $b = New-Object System.Drawing.SolidBrush $stone
    $p = New-Object System.Drawing.Pen $edge, 3
    $g.FillRectangle($b, 138, 350, 236, 68)
    $g.DrawRectangle($p, 138, 350, 236, 68)
    $g.FillRectangle($b, 170, 312, 172, 42)
    $g.DrawRectangle($p, 170, 312, 172, 42)

    switch ($Variant) {
        1 {
            $body = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(256, 144),
                [System.Drawing.PointF]::new(304, 304),
                [System.Drawing.PointF]::new(208, 304)
            )
            $g.FillPolygon($b, $body)
            $g.DrawPolygon($p, $body)
            $g.FillEllipse($b, 232, 108, 48, 48)
            $g.DrawEllipse($p, 232, 108, 48, 48)
            $g.FillRectangle($b, 298, 118, 12, 180)
            $g.DrawRectangle($p, 298, 118, 12, 180)
        }
        2 {
            $g.FillEllipse($b, 228, 102, 56, 56)
            $g.DrawEllipse($p, 228, 102, 56, 56)
            $g.FillRectangle($b, 232, 154, 48, 142)
            $g.DrawRectangle($p, 232, 154, 48, 142)
            $wingL = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(232, 176),
                [System.Drawing.PointF]::new(176, 232),
                [System.Drawing.PointF]::new(222, 256)
            )
            $wingR = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(280, 176),
                [System.Drawing.PointF]::new(336, 232),
                [System.Drawing.PointF]::new(290, 256)
            )
            $g.FillPolygon($b, $wingL)
            $g.FillPolygon($b, $wingR)
            $g.DrawPolygon($p, $wingL)
            $g.DrawPolygon($p, $wingR)
        }
        3 {
            $lion = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(184, 286),
                [System.Drawing.PointF]::new(236, 172),
                [System.Drawing.PointF]::new(288, 168),
                [System.Drawing.PointF]::new(334, 258),
                [System.Drawing.PointF]::new(308, 304),
                [System.Drawing.PointF]::new(206, 304)
            )
            $g.FillPolygon($b, $lion)
            $g.DrawPolygon($p, $lion)
            $g.FillEllipse($b, 252, 128, 68, 54)
            $g.DrawEllipse($p, 252, 128, 68, 54)
        }
        default {
            $g.FillEllipse($b, 230, 102, 52, 52)
            $g.DrawEllipse($p, 230, 102, 52, 52)
            $robe = [System.Drawing.PointF[]]@(
                [System.Drawing.PointF]::new(256, 150),
                [System.Drawing.PointF]::new(316, 304),
                [System.Drawing.PointF]::new(196, 304)
            )
            $g.FillPolygon($b, $robe)
            $g.DrawPolygon($p, $robe)
            $g.FillRectangle($b, 312, 154, 10, 142)
            $g.DrawRectangle($p, 312, 154, 10, 142)
            $orbBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(120, 146, 186, 255))
            $g.FillEllipse($orbBrush, 300, 120, 38, 38)
            $orbBrush.Dispose()
        }
    }

    for ($m = 0; $m -lt 9; $m++) {
        $patch = New-Object System.Drawing.SolidBrush $patina
        $mx = 174 + $rng.Next(0, 164)
        $my = 120 + $rng.Next(0, 226)
        $mw = 10 + $rng.Next(0, 24)
        $mh = 8 + $rng.Next(0, 20)
        $g.FillEllipse($patch, $mx, $my, $mw, $mh)
        $patch.Dispose()
    }

    Draw-StoneNoise -Graphics $g -Rng $rng -X 138 -Y 102 -W 238 -H 320
    Draw-CrackLines -Graphics $g -Rng $rng -X 142 -Y 108 -W 228 -H 306

    $b.Dispose()
    $p.Dispose()

    Save-Canvas -Bitmap $bmp -Graphics $g -Path $OutPath
}

$ruinsDir = Join-Path $decorRoot "ruins"
$altarDir = Join-Path $decorRoot "altar"
$torchDir = Join-Path $decorRoot "torch"
$statueDir = Join-Path $decorRoot "statue"

Draw-Ruin   -OutPath (Join-Path $ruinsDir  "asset_401.png") -Variant 1
Draw-Ruin   -OutPath (Join-Path $ruinsDir  "asset_402.png") -Variant 2
Draw-Ruin   -OutPath (Join-Path $ruinsDir  "asset_403.png") -Variant 3
Draw-Ruin   -OutPath (Join-Path $ruinsDir  "asset_404.png") -Variant 4

Draw-Altar  -OutPath (Join-Path $altarDir  "asset_501.png") -Variant 1
Draw-Altar  -OutPath (Join-Path $altarDir  "asset_502.png") -Variant 2
Draw-Altar  -OutPath (Join-Path $altarDir  "asset_503.png") -Variant 3
Draw-Altar  -OutPath (Join-Path $altarDir  "asset_504.png") -Variant 4

Draw-Torch  -OutPath (Join-Path $torchDir  "asset_601.png") -Variant 1
Draw-Torch  -OutPath (Join-Path $torchDir  "asset_602.png") -Variant 2
Draw-Torch  -OutPath (Join-Path $torchDir  "asset_603.png") -Variant 3
Draw-Torch  -OutPath (Join-Path $torchDir  "asset_604.png") -Variant 4

Draw-Statue -OutPath (Join-Path $statueDir "asset_701.png") -Variant 1
Draw-Statue -OutPath (Join-Path $statueDir "asset_702.png") -Variant 2
Draw-Statue -OutPath (Join-Path $statueDir "asset_703.png") -Variant 3
Draw-Statue -OutPath (Join-Path $statueDir "asset_704.png") -Variant 4

Write-Output "Premium prop pack generated in $decorRoot"
