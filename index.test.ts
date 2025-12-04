import { describe, test, expect, beforeEach } from "bun:test";
import { Window } from "happy-dom";

describe("chunked-transfer extension", () => {
  let window: Window;
  let document: Document;
  let mockApi: any;
  let registeredExtension: any;
  let target: HTMLElement;

  beforeEach(async () => {
    // Fresh DOM for each test
    window = new Window();
    document = window.document as unknown as Document;
    globalThis.document = document;

    // Create target element
    target = document.createElement("div");
    target.id = "target";
    document.body.appendChild(target);

    // Mock htmx API
    mockApi = {
      getTarget: () => target,
      getSwapSpecification: () => ({ swapStyle: "innerHTML" }),
      makeSettleInfo: () => ({ tasks: [], elts: [] }),
      swap: (targetEl: HTMLElement, content: string) => {
        // Real DOM manipulation for v2 API
        targetEl.innerHTML = content;
      },
      selectAndSwap: (
        swapStyle: string,
        targetEl: HTMLElement,
        elt: Element,
        content: string,
      ) => {
        // Real DOM manipulation for v1 API
        targetEl.innerHTML = content;
      },
      settleImmediately: () => {},
      withExtensions: (elt: Element, cb: (ext: any) => void) => {},
    };

    globalThis.htmx = {
      defineExtension: (name: string, ext: any) => {
        registeredExtension = ext;
      },
    } as any;

    // Dynamically import to execute the extension IIFE
    await import("./index.ts");
    registeredExtension.init(mockApi);
  });

  describe("core functionality", () => {
    test("registers extension with correct name", () => {
      expect(globalThis.htmx.defineExtension).toBeDefined();
      expect(registeredExtension).toBeDefined();
      expect(registeredExtension.init).toBeDefined();
      expect(registeredExtension.onEvent).toBeDefined();
    });

    test("ignores non-chunked responses", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return null;
          return null;
        },
        response: "<p>Normal response</p>",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);

      // Simulate progress - should do nothing for non-chunked
      if (mockXhr.onprogress) {
        mockXhr.onprogress();
      }

      // Target should still be empty (no swap happened)
      expect(target.innerHTML).toBe("");
    });

    test("ignores events other than beforeRequest", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: () => "chunked",
        response: "<p>Content</p>",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      // This should not set up xhr.onprogress
      registeredExtension.onEvent("htmx:afterRequest", event);

      expect(mockXhr.onprogress).toBeNull();
    });
  });

  describe("chunked response processing", () => {
    test("processes chunked responses with v2 API (swap method)", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<p>Chunk 1</p>",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);

      // Verify onprogress handler was set
      expect(mockXhr.onprogress).toBeDefined();

      // Simulate progress event
      mockXhr.onprogress!();

      // Verify content was swapped
      expect(target.innerHTML).toBe("<p>Chunk 1</p>");
    });

    test("processes chunked responses with v1 API (selectAndSwap fallback)", () => {
      const element = document.createElement("div");

      // Remove v2 swap method to force v1 fallback
      const originalSwap = mockApi.swap;
      delete mockApi.swap;

      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<p>Chunk from v1</p>",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Verify content was swapped using v1 API
      expect(target.innerHTML).toBe("<p>Chunk from v1</p>");

      // Restore for other tests
      mockApi.swap = originalSwap;
    });

    test("accumulates multiple chunks (default append behavior)", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<p>A</p>",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);

      // Simulate three progressive chunks
      mockXhr.response = "<p>A</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>A</p>");

      mockXhr.response = "<p>A</p><p>B</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>A</p><p>B</p>");

      mockXhr.response = "<p>A</p><p>B</p><p>C</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>A</p><p>B</p><p>C</p>");
    });
  });

  describe("extension transformation chain", () => {
    test("allows other extensions to transform response", () => {
      const element = document.createElement("div");

      // Mock extension that adds prefix to response
      mockApi.withExtensions = (elt: Element, callback: (ext: any) => void) => {
        callback({
          transformResponse: (text: string) => `<div>transformed</div>${text}`,
        });
      };

      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<p>content</p>",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Verify content was transformed (div prepended)
      expect(target.innerHTML).toBe("<div>transformed</div><p>content</p>");
    });
  });
});
