Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$decorRoot = Join-Path $projectRoot "public/assets/decorations"

$folders = @("ruins", "altar", "torch", "statue")
foreach ($folder in $folders) {
    New-Item -ItemType Directory -Force -Path (Join-Path $decorRoot $folder) | Out-Null
}

$SCALE = 4
$BASE = 96
$OUT = $BASE * $SCALE

function C([int]$r, [int]$g, [int]$b, [int]$a = 255) {
    return [System.Drawing.Color]::FromArgb($a, $r, $g, $b)
}

function New-PixelCanvas {
    $bmp = New-Object System.Drawing.Bitmap $BASE, $BASE, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $g.Clear((C 0 0 0 0))
    return @{ Bitmap = $bmp; Graphics = $g }
}

function Save-PixelCanvas([System.Drawing.Bitmap]$bmp, [System.Drawing.Graphics]$g, [string]$path) {
    $g.Dispose()
    $finalBmp = New-Object System.Drawing.Bitmap $OUT, $OUT, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $fg = [System.Drawing.Graphics]::FromImage($finalBmp)
    $fg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::None
    $fg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
    $fg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
    $fg.Clear((C 0 0 0 0))
    $fg.DrawImage($bmp, 0, 0, $OUT, $OUT)
    $fg.Dispose()
    $bmp.Dispose()
    $finalBmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $finalBmp.Dispose()
}

function FillPx([System.Drawing.Graphics]$g, [int]$x, [int]$y, [int]$w, [int]$h, [System.Drawing.Color]$color) {
    $b = New-Object System.Drawing.SolidBrush $color
    $g.FillRectangle($b, $x, $y, $w, $h)
    $b.Dispose()
}

function DotPx([System.Drawing.Graphics]$g, [int]$x, [int]$y, [System.Drawing.Color]$color) {
    FillPx $g $x $y 1 1 $color
}

function StoneRect([System.Drawing.Graphics]$g, [System.Random]$rng, [int]$x, [int]$y, [int]$w, [int]$h) {
    $base = C 156 158 162
    $mid = C 138 142 146
    $dark = C 94 98 106
    $line = C 68 72 78
    $moss = C 112 142 98
    $mossDark = C 76 106 66
    $hi = C 186 188 194

    FillPx $g $x $y $w $h $base
    FillPx $g $x $y $w 1 $hi
    FillPx $g $x $y 1 $h $hi
    FillPx $g ($x + $w - 1) $y 1 $h $line
    FillPx $g $x ($y + $h - 1) $w 1 $line

    for ($i = 0; $i -lt [Math]::Floor(($w * $h) / 6); $i++) {
        $nx = $x + $rng.Next(1, [Math]::Max(2, $w - 1))
        $ny = $y + $rng.Next(1, [Math]::Max(2, $h - 1))
        $pick = $rng.Next(0, 5)
        if ($pick -le 2) {
            DotPx $g $nx $ny $mid
        } elseif ($pick -eq 3) {
            DotPx $g $nx $ny $dark
        } else {
            DotPx $g $nx $ny $hi
        }
    }

    for ($m = 0; $m -lt [Math]::Max(1, [Math]::Floor($w / 8)); $m++) {
        $mx = $x + $rng.Next(1, [Math]::Max(2, $w - 4))
        $mw = 2 + $rng.Next(0, 3)
        FillPx $g $mx $y $mw 1 $moss
        if ($rng.NextDouble() -gt 0.45) {
            FillPx $g $mx ($y + 1) ([Math]::Max(1, $mw - 1)) 1 $mossDark
        }
    }
}

function Crack([System.Drawing.Graphics]$g, [int]$x, [int]$y, [int]$len) {
    $c = C 74 78 82
    for ($i = 0; $i -lt $len; $i++) {
        DotPx $g ($x + $i) ($y + [Math]::Floor($i / 2)) $c
    }
}

function ShadowBlob([System.Drawing.Graphics]$g, [int]$x, [int]$y, [int]$w, [int]$h) {
    FillPx $g $x $y $w $h (C 0 0 0 46)
    FillPx $g ($x + 2) ($y - 1) ([Math]::Max(1, $w - 4)) 1 (C 0 0 0 24)
    FillPx $g ($x + 1) ($y + $h) ([Math]::Max(1, $w - 2)) 1 (C 0 0 0 18)
}

function Draw-RuinV2([string]$outPath, [int]$variant) {
    $ctx = New-PixelCanvas
    $bmp = $ctx.Bitmap
    $g = $ctx.Graphics
    $rng = [System.Random]::new(7100 + $variant)

    ShadowBlob $g 22 82 52 5

    switch ($variant) {
        1 {
            StoneRect $g $rng 20 40 10 40
            StoneRect $g $rng 66 40 10 40
            StoneRect $g $rng 24 32 48 10
        }
        2 {
            StoneRect $g $rng 22 52 52 28
            StoneRect $g $rng 49 30 12 52
            StoneRect $g $rng 36 24 24 10
        }
        3 {
            StoneRect $g $rng 16 40 14 40
            StoneRect $g $rng 66 40 14 40
            StoneRect $g $rng 20 30 60 12
            StoneRect $g $rng 40 52 16 18
            FillPx $g 42 54 12 14 (C 18 24 32 180)
        }
        default {
            StoneRect $g $rng 24 68 48 12
            StoneRect $g $rng 38 26 20 44
            FillPx $g 44 22 8 4 (C 174 178 182)
            FillPx $g 45 20 6 2 (C 192 196 200)
        }
    }

    for ($i = 0; $i -lt 6; $i++) {
        $cx = 24 + $rng.Next(0, 48)
        $cy = 38 + $rng.Next(0, 36)
        Crack $g $cx $cy (3 + $rng.Next(0, 4))
    }

    Save-PixelCanvas $bmp $g $outPath
}

function Draw-AltarV2([string]$outPath, [int]$variant) {
    $ctx = New-PixelCanvas
    $bmp = $ctx.Bitmap
    $g = $ctx.Graphics
    $rng = [System.Random]::new(7200 + $variant)

    ShadowBlob $g 20 82 56 5

    StoneRect $g $rng 20 70 56 12
    StoneRect $g $rng 26 62 44 10
    StoneRect $g $rng 32 54 32 8

    $glow = switch ($variant) {
        1 { C 90 172 240 120 }
        2 { C 112 255 186 120 }
        3 { C 255 168 92 120 }
        default { C 188 146 255 120 }
    }
    FillPx $g 35 49 26 5 $glow
    FillPx $g 40 47 16 2 (C $glow.R $glow.G $glow.B 165)

    if ($variant -eq 2) {
        StoneRect $g $rng 44 42 8 12
    } elseif ($variant -eq 3) {
        FillPx $g 43 42 10 10 (C 164 166 170)
        Crack $g 45 44 4
    } elseif ($variant -eq 4) {
        FillPx $g 41 43 14 8 (C 170 172 178)
        DotPx $g 47 46 (C 118 156 222)
    }

    for ($r = 0; $r -lt 12; $r++) {
        $rx = 30 + $rng.Next(0, 34)
        $ry = 34 + $rng.Next(0, 20)
        DotPx $g $rx $ry (C $glow.R $glow.G $glow.B (90 + $rng.Next(0, 110)))
    }

    Save-PixelCanvas $bmp $g $outPath
}

function Draw-TorchV2([string]$outPath, [int]$variant) {
    $ctx = New-PixelCanvas
    $bmp = $ctx.Bitmap
    $g = $ctx.Graphics

    $wood = C 108 76 52
    $woodDark = C 76 54 38
    $metal = C 150 152 160

    ShadowBlob $g 41 84 16 4
    FillPx $g 45 30 8 54 $wood
    FillPx $g 45 30 1 54 $woodDark
    FillPx $g 52 30 1 54 $woodDark
    FillPx $g 43 42 12 3 $metal
    FillPx $g 44 58 10 2 $metal

    $flameA = switch ($variant) {
        1 { C 255 142 48 220 }
        2 { C 255 168 64 220 }
        3 { C 255 128 40 220 }
        default { C 255 182 76 220 }
    }
    $flameB = C 255 236 144 230

    FillPx $g 36 20 26 10 (C $flameA.R $flameA.G $flameA.B 140)
    FillPx $g 41 14 16 12 $flameA
    FillPx $g 46 12 6 10 $flameB

    for ($s = 0; $s -lt 10; $s++) {
        $sx = 42 + (Get-Random -Minimum 0 -Maximum 14)
        $sy = 6 + (Get-Random -Minimum 0 -Maximum 10)
        DotPx $g $sx $sy (C 255 196 104 (100 + (Get-Random -Minimum 0 -Maximum 120)))
    }

    Save-PixelCanvas $bmp $g $outPath
}

function Draw-StatueV2([string]$outPath, [int]$variant) {
    $ctx = New-PixelCanvas
    $bmp = $ctx.Bitmap
    $g = $ctx.Graphics
    $rng = [System.Random]::new(7400 + $variant)

    ShadowBlob $g 22 82 52 5

    StoneRect $g $rng 22 70 52 12
    StoneRect $g $rng 28 62 40 8

    switch ($variant) {
        1 {
            FillPx $g 45 30 6 10 (C 166 170 176)
            FillPx $g 38 40 20 22 (C 158 162 168)
            FillPx $g 54 36 3 24 (C 120 124 132)
        }
        2 {
            FillPx $g 44 30 8 10 (C 166 170 176)
            FillPx $g 40 40 16 22 (C 160 164 170)
            FillPx $g 34 44 8 8 (C 150 154 162)
            FillPx $g 54 44 8 8 (C 150 154 162)
        }
        3 {
            FillPx $g 40 30 16 8 (C 164 168 174)
            FillPx $g 36 38 24 24 (C 154 158 164)
            FillPx $g 50 34 6 18 (C 120 124 132)
        }
        default {
            FillPx $g 44 30 8 10 (C 168 172 178)
            FillPx $g 38 40 20 22 (C 158 162 168)
            FillPx $g 56 32 4 20 (C 126 132 146)
            DotPx $g 58 30 (C 168 190 240)
        }
    }

    for ($m = 0; $m -lt 8; $m++) {
        $mx = 28 + $rng.Next(0, 40)
        $my = 40 + $rng.Next(0, 22)
        FillPx $g $mx $my (1 + $rng.Next(0, 3)) 1 (C 106 136 98 130)
    }
    for ($c = 0; $c -lt 5; $c++) {
        Crack $g (30 + $rng.Next(0, 34)) (42 + $rng.Next(0, 24)) (2 + $rng.Next(0, 3))
    }

    Save-PixelCanvas $bmp $g $outPath
}

$ruinsDir = Join-Path $decorRoot "ruins"
$altarDir = Join-Path $decorRoot "altar"
$torchDir = Join-Path $decorRoot "torch"
$statueDir = Join-Path $decorRoot "statue"

Draw-RuinV2   -outPath (Join-Path $ruinsDir  "asset_451_v2.png") -variant 1
Draw-RuinV2   -outPath (Join-Path $ruinsDir  "asset_452_v2.png") -variant 2
Draw-RuinV2   -outPath (Join-Path $ruinsDir  "asset_453_v2.png") -variant 3
Draw-RuinV2   -outPath (Join-Path $ruinsDir  "asset_454_v2.png") -variant 4

Draw-AltarV2  -outPath (Join-Path $altarDir  "asset_551_v2.png") -variant 1
Draw-AltarV2  -outPath (Join-Path $altarDir  "asset_552_v2.png") -variant 2
Draw-AltarV2  -outPath (Join-Path $altarDir  "asset_553_v2.png") -variant 3
Draw-AltarV2  -outPath (Join-Path $altarDir  "asset_554_v2.png") -variant 4

Draw-TorchV2  -outPath (Join-Path $torchDir  "asset_651_v2.png") -variant 1
Draw-TorchV2  -outPath (Join-Path $torchDir  "asset_652_v2.png") -variant 2
Draw-TorchV2  -outPath (Join-Path $torchDir  "asset_653_v2.png") -variant 3
Draw-TorchV2  -outPath (Join-Path $torchDir  "asset_654_v2.png") -variant 4

Draw-StatueV2 -outPath (Join-Path $statueDir "asset_751_v2.png") -variant 1
Draw-StatueV2 -outPath (Join-Path $statueDir "asset_752_v2.png") -variant 2
Draw-StatueV2 -outPath (Join-Path $statueDir "asset_753_v2.png") -variant 3
Draw-StatueV2 -outPath (Join-Path $statueDir "asset_754_v2.png") -variant 4

Write-Output "Premium V2 pixel-art props generated."
