import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(cleanup);

const zeroRect = (): DOMRect => new DOMRect(0, 0, 0, 0);

if (!Element.prototype.getClientRects) {
  Element.prototype.getClientRects = function getClientRects(): DOMRectList {
    return [this.getBoundingClientRect()] as unknown as DOMRectList;
  };
}

if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = function getClientRects(): DOMRectList {
    return [zeroRect()] as unknown as DOMRectList;
  };
}

if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = zeroRect;
}

if (!document.elementFromPoint) {
  document.elementFromPoint = (): Element | null =>
    document.querySelector(".ProseMirror") ?? document.body;
}
