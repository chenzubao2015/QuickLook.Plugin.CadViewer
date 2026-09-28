#!/usr/bin/env python3
"""Generates the demo drawing shipped with the screenshots of this repository.

The output is a plain AutoCAD R12 ASCII DXF containing only LINE, CIRCLE, ARC, SOLID and TEXT
entities, which every DXF reader understands. Run it from the repository root:

    python tools/make-demo-dxf.py docs/demo-flange.dxf
"""

import math
import sys

# AutoCAD colour indices used by the demo drawing.
WHITE = 7      # visible outlines
RED = 1        # centre lines
GREEN = 3      # dimensions
BLUE = 5       # hidden edges
GREY = 8       # frame and title block

SHEET_WIDTH = 420.0    # A3 landscape, in millimetres
SHEET_HEIGHT = 297.0
MARGIN = 10.0

entities = []


def emit(*pairs):
    for code, value in pairs:
        entities.append(str(code))
        entities.append(str(value))


def line(x1, y1, x2, y2, colour=WHITE):
    emit((0, "LINE"), (8, "0"), (62, colour),
         (10, round(x1, 4)), (20, round(y1, 4)), (30, 0.0),
         (11, round(x2, 4)), (21, round(y2, 4)), (31, 0.0))


def circle(cx, cy, radius, colour=WHITE):
    emit((0, "CIRCLE"), (8, "0"), (62, colour),
         (10, round(cx, 4)), (20, round(cy, 4)), (30, 0.0), (40, round(radius, 4)))


def arc(cx, cy, radius, start, end, colour=WHITE):
    emit((0, "ARC"), (8, "0"), (62, colour),
         (10, round(cx, 4)), (20, round(cy, 4)), (30, 0.0),
         (40, round(radius, 4)), (50, round(start, 4)), (51, round(end, 4)))


def solid(points, colour=WHITE):
    """Filled quadrilateral. The third and fourth corners are swapped on purpose: that is the
    ordering AutoCAD expects for a SOLID entity."""
    (x1, y1), (x2, y2), (x3, y3), (x4, y4) = points
    emit((0, "SOLID"), (8, "0"), (62, colour),
         (10, round(x1, 4)), (20, round(y1, 4)), (30, 0.0),
         (11, round(x2, 4)), (21, round(y2, 4)), (31, 0.0),
         (12, round(x3, 4)), (22, round(y3, 4)), (32, 0.0),
         (13, round(x4, 4)), (23, round(y4, 4)), (33, 0.0))


def text(x, y, height, value, colour=WHITE, rotation=0.0):
    emit((0, "TEXT"), (8, "0"), (62, colour),
         (10, round(x, 4)), (20, round(y, 4)), (30, 0.0),
         (40, round(height, 4)), (1, value), (50, round(rotation, 4)))


def arrow(tip_x, tip_y, direction, size=3.0):
    """Solid triangular dimension arrow. `direction` is +1 (pointing +x) or -1 (pointing -x).
    A SOLID always carries four corners, so the tip is repeated to collapse one edge."""
    base_x = tip_x - direction * size * 2.0
    solid([(tip_x, tip_y),
           (base_x, tip_y + size * 0.5),
           (base_x, tip_y - size * 0.5),
           (tip_x, tip_y)], GREEN)


def dashed_line(x1, y1, x2, y2, dash=4.0, gap=3.0, colour=BLUE):
    length = math.hypot(x2 - x1, y2 - y1)
    if length == 0:
        return
    ux, uy = (x2 - x1) / length, (y2 - y1) / length
    position = 0.0
    while position < length:
        end = min(position + dash, length)
        line(x1 + ux * position, y1 + uy * position, x1 + ux * end, y1 + uy * end, colour)
        position = end + gap


def centre_line(x1, y1, x2, y2, extend=4.0):
    """Chain line used for centring holes: long dash, short dash, long dash."""
    length = math.hypot(x2 - x1, y2 - y1)
    ux, uy = (x2 - x1) / length, (y2 - y1) / length
    position = -extend
    pattern = [10.0, -3.0, 2.0, -3.0]
    index = 0
    while position < length + extend:
        span = pattern[index % len(pattern)]
        if span > 0:
            start = max(position, -extend)
            end = min(position + span, length + extend)
            if end > start:
                line(x1 + ux * start, y1 + uy * start, x1 + ux * end, y1 + uy * end, RED)
        position += abs(span)
        index += 1


def frame():
    line(MARGIN, MARGIN, SHEET_WIDTH - MARGIN, MARGIN, GREY)
    line(SHEET_WIDTH - MARGIN, MARGIN, SHEET_WIDTH - MARGIN, SHEET_HEIGHT - MARGIN, GREY)
    line(SHEET_WIDTH - MARGIN, SHEET_HEIGHT - MARGIN, MARGIN, SHEET_HEIGHT - MARGIN, GREY)
    line(MARGIN, SHEET_HEIGHT - MARGIN, MARGIN, MARGIN, GREY)


def title_block():
    left, right = 210.0, SHEET_WIDTH - MARGIN
    bottom, top = MARGIN, 50.0
    line(left, top, right, top, GREY)
    line(left, bottom, left, top, GREY)
    for y in (20.0, 32.0, 41.0):
        line(left, y, right, y, GREY)
    line(256.0, bottom, 256.0, 32.0, GREY)
    line(300.0, 32.0, 300.0, 41.0, GREY)
    line(332.0, 32.0, 332.0, 41.0, GREY)
    line(300.0, 20.0, 300.0, 32.0, GREY)

    text(left + 3, 15.0, 5.0, "DRAWN BY", GREY)
    text(260, 15.0, 5.0, "DATE  2026-09-28", GREY)
    text(335, 15.0, 5.0, "SHEET  1/1", GREY)
    text(left + 3, 26.0, 5.0, "CHECKED", GREY)
    text(260, 26.0, 5.0, "APPROVED", GREY)
    text(left + 3, 36.0, 5.0, "MATERIAL  AL", GREY)
    text(303, 36.0, 5.0, "ANODISE", GREY)
    text(335, 36.0, 5.0, "SCALE  1:1", GREY)
    text(left + 3, 43.0, 6.0, "FLANGE PLATE", WHITE)
    text(303, 44.0, 5.0, "DWG  FP-1001", GREY)


def front_view():
    """Bolt circle layout with centre bore and a keyway, dimensioned."""
    cx, cy = 105.0, 175.0
    outer, bore, bolt_circle, bolt_hole = 62.0, 24.0, 46.0, 8.5

    circle(cx, cy, outer)
    circle(cx, cy, bore)
    circle(cx, cy, bore + 6.0)

    for index in range(6):
        angle = math.radians(index * 60.0 + 15.0)
        hx = cx + math.cos(angle) * bolt_circle
        hy = cy + math.sin(angle) * bolt_circle
        circle(hx, hy, bolt_hole)
        centre_line(hx - 13.0, hy, hx + 13.0, hy, extend=0.0)
        centre_line(hx, hy - 13.0, hx, hy + 13.0, extend=0.0)

    centre_line(cx - bolt_circle - 14.0, cy, cx + bolt_circle + 14.0, cy)
    centre_line(cx, cy - bolt_circle - 14.0, cx, cy + bolt_circle + 14.0)
    centre_line(cx + math.cos(math.radians(120)) * (outer + 10),
                cy + math.sin(math.radians(120)) * (outer + 10),
                cx + math.cos(math.radians(-60)) * (outer + 10),
                cy + math.sin(math.radians(-60)) * (outer + 10))

    # Keyway in the bore.
    line(cx - 5.0, cy + bore, cx - 5.0, cy + bore + 5.0)
    line(cx + 5.0, cy + bore, cx + 5.0, cy + bore + 5.0)
    line(cx - 5.0, cy + bore + 5.0, cx + 5.0, cy + bore + 5.0)

    # Diameter dimension of the bolt circle.
    dim_y = cy - outer - 22.0
    line(cx, cy - bolt_circle, cx, dim_y, GREEN)
    line(cx - bolt_circle, cy - outer - 16.0, cx - bolt_circle, dim_y, GREEN)
    line(cx + bolt_circle, cy - outer - 16.0, cx + bolt_circle, dim_y, GREEN)
    line(cx - bolt_circle, dim_y, cx + bolt_circle, dim_y, GREEN)
    arrow(cx - bolt_circle, dim_y, -1)
    arrow(cx + bolt_circle, dim_y, +1)
    text(cx - 16.0, dim_y + 3.0, 6.0, "6x R8.5", GREEN)

    # Outside diameter dimension.
    text(cx - outer + 4.0, cy + outer + 6.0, 6.0, "DIA 124", GREEN)
    text(cx - 18.0, cy + bore + 12.0, 5.0, "DIA 48", GREEN)


def section_view():
    """Half section of the plate showing the bore, counterbore and hatch."""
    cx, cy = 300.0, 175.0
    outer, bore = 62.0, 24.0
    thickness = 18.0

    # Outline of the section (upper half) with the bore cut away.
    line(cx - outer, cy, cx - outer, cy + thickness)
    line(cx - outer, cy + thickness, cx - bore, cy + thickness)
    line(cx - bore, cy + thickness, cx - bore, cy)
    line(cx - bore, cy, cx - outer, cy)

    # Counterbore.
    line(cx - bore - 11.0, cy + thickness, cx - bore - 11.0, cy + thickness - 7.0)
    line(cx - bore - 11.0, cy + thickness - 7.0, cx - bore, cy + thickness - 7.0)

    # Section hatching at 45 degrees.
    step = 6.0
    x = cx - outer + 2.0
    while x < cx - bore - 11.0:
        length = min(step * 1.4, cy + thickness - cy)
        line(x, cy + 1.0, x + length * 0.7, cy + 1.0 + length, GREY)
        x += step

    # Hidden line for the bolt hole.
    hx = cx - outer + 12.0
    dashed_line(hx, cy, hx, cy + thickness)
    centre_line(hx - 12.0, cy + thickness / 2, hx + 12.0, cy + thickness / 2, extend=0.0)
    centre_line(cx - outer - 8.0, cy + thickness / 2, cx + 8.0, cy + thickness / 2)

    thickness_dim = cy - 16.0
    line(cx - outer, cy, cx - outer, thickness_dim, GREEN)
    line(cx - outer, cy + thickness, cx - outer, thickness_dim, GREEN)
    line(cx - outer - 12.0, cy, cx - outer, cy, GREEN)
    line(cx - outer - 12.0, cy + thickness, cx - outer, cy + thickness, GREEN)
    line(cx - outer - 6.0, thickness_dim, cx - outer, thickness_dim, GREEN)
    line(cx - outer - 6.0, thickness_dim, cx - outer - 6.0, cy + thickness + 8.0, GREEN)
    text(cx - outer - 34.0, thickness_dim + 2.0, 6.0, "18 THK", GREEN)
    text(cx - outer, cy + thickness + 12.0, 5.0, "SECTION A-A", WHITE)


def main():
    output = sys.argv[1] if len(sys.argv) > 1 else "docs/demo-flange.dxf"

    frame()
    title_block()
    front_view()
    section_view()

    header = ["0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1009",
              "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
              "0", "SECTION", "2", "TABLES", "0", "ENDSEC",
              "0", "SECTION", "2", "ENTITIES"]
    with open(output, "w", encoding="ascii") as handle:
        handle.write("\n".join(header) + "\n")
        handle.write("\n".join(entities) + "\n")
        handle.write("\n".join(["0", "ENDSEC", "0", "EOF"]) + "\n")
    print("wrote " + output + " with " + str(len(entities) // 2) + " group codes")


if __name__ == "__main__":
    main()
