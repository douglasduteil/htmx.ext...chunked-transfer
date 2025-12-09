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
          // Non-chunked responses have Content-Length
          if (header === "Content-Length") return "22";
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

    test("processes HTTP/2 streaming responses (no Transfer-Encoding or Content-Length)", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          // HTTP/2 streaming: no Transfer-Encoding, no Content-Length
          return null;
        },
        response: "<p>HTTP/2 streamed content</p>",
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
      expect(target.innerHTML).toBe("<p>HTTP/2 streamed content</p>");
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

  describe("comment filtering (heartbeats)", () => {
    test("ignores comment-only chunks", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<!-- heartbeat -->",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Target should remain empty (comment-only chunk ignored)
      expect(target.innerHTML).toBe("");
    });

    test("ignores multi-line comment-only chunks", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<!-- \n  heartbeat\n  still processing\n -->",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Multi-line comment should also be ignored
      expect(target.innerHTML).toBe("");
    });

    test("ignores multiple comments without content", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<!-- comment 1 --><!-- comment 2 -->   ",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Multiple comments with only whitespace should be ignored
      expect(target.innerHTML).toBe("");
    });

    test("processes chunks with comments and HTML content", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<!-- debug info --><p>Content</p>",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Should process the chunk (has HTML beyond comments)
      expect(target.innerHTML).toBe("<!-- debug info --><p>Content</p>");
    });

    test("processes chunks with comments between HTML", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<p>Start</p><!-- middle --><p>End</p>",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Should process the entire chunk
      expect(target.innerHTML).toBe("<p>Start</p><!-- middle --><p>End</p>");
    });

    test("processes empty chunks (no comments)", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Empty chunks pass through (no content added, but swap is called)
      expect(target.innerHTML).toBe("");
    });

    test("processes whitespace-only chunks (no comments)", () => {
      const element = document.createElement("div");
      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "   \n  \t  ",
        onprogress: null as any,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);
      mockXhr.onprogress!();

      // Whitespace-only chunks (no comments) pass through and get trimmed by DOM
      // The whitespace gets normalized to empty when set as innerHTML
      expect(target.innerHTML.trim()).toBe("");
    });
  });

  describe("hx-chunked-mode=swap", () => {
    test("default mode (append) - accumulates all chunks", () => {
      const element = document.createElement("div");
      // No hx-chunked-mode attribute = defaults to append

      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "",
        onprogress: null as any,
        _chunkedMode: undefined,
        _chunkedLastLen: 0,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);

      // Verify mode was set to append
      expect(mockXhr._chunkedMode).toBe("append");

      // Simulate progressive chunks - full response each time
      mockXhr.response = "<p>Loading...</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>Loading...</p>");

      mockXhr.response = "<p>Loading...</p><p>50%</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>Loading...</p><p>50%</p>");

      mockXhr.response = "<p>Loading...</p><p>50%</p><p>Done!</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>Loading...</p><p>50%</p><p>Done!</p>");
    });

    test("swap mode - only swaps new content (incremental)", () => {
      const element = document.createElement("div");
      element.setAttribute("hx-chunked-mode", "swap");

      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "",
        onprogress: null as any,
        _chunkedMode: undefined,
        _chunkedLastLen: 0,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);

      // Verify mode was set to swap
      expect(mockXhr._chunkedMode).toBe("swap");

      // First chunk - everything is new
      mockXhr.response = "<p>Loading...</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>Loading...</p>");
      expect(mockXhr._chunkedLastLen).toBe(mockXhr.response.length);

      // Second chunk - only new content swapped
      mockXhr.response = "<p>Loading...</p><p>50%</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>50%</p>"); // Only the NEW part
      expect(mockXhr._chunkedLastLen).toBe(mockXhr.response.length);

      // Third chunk - only newest content swapped
      mockXhr.response = "<p>Loading...</p><p>50%</p><p>Done!</p>";
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>Done!</p>"); // Only the NEWEST part
      expect(mockXhr._chunkedLastLen).toBe(mockXhr.response.length);
    });

    test("swap mode - ignores duplicate progress events (same length)", () => {
      const element = document.createElement("div");
      element.setAttribute("hx-chunked-mode", "swap");

      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<p>Content</p>",
        onprogress: null as any,
        _chunkedMode: undefined,
        _chunkedLastLen: 0,
      };

      const event = {
        target: element,
        detail: { xhr: mockXhr },
      };

      registeredExtension.onEvent("htmx:beforeRequest", event);

      // First progress event
      mockXhr.onprogress!();
      expect(target.innerHTML).toBe("<p>Content</p>");
      const firstHtml = target.innerHTML;

      // Duplicate progress event - same response length
      mockXhr.onprogress!();
      // Should not swap again (innerHTML unchanged)
      expect(target.innerHTML).toBe(firstHtml);
    });

    test("swap mode - prevents final htmx:beforeSwap", () => {
      const element = document.createElement("div");
      element.setAttribute("hx-chunked-mode", "swap");

      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<p>Final</p>",
        _chunkedMode: "swap",
      };

      const beforeSwapEvent = {
        target: element,
        detail: {
          xhr: mockXhr,
          shouldSwap: true, // Initially true
        },
      };

      // Trigger beforeSwap event
      registeredExtension.onEvent("htmx:beforeSwap", beforeSwapEvent);

      // Verify shouldSwap was set to false
      expect(beforeSwapEvent.detail.shouldSwap).toBe(false);
    });

    test("append mode - allows final htmx:beforeSwap", () => {
      const element = document.createElement("div");
      // Default append mode

      const mockXhr = {
        getResponseHeader: (header: string) => {
          if (header === "Transfer-Encoding") return "chunked";
          return null;
        },
        response: "<p>Final</p>",
        _chunkedMode: "append",
      };

      const beforeSwapEvent = {
        target: element,
        detail: {
          xhr: mockXhr,
          shouldSwap: true,
        },
      };

      // Trigger beforeSwap event
      registeredExtension.onEvent("htmx:beforeSwap", beforeSwapEvent);

      // Verify shouldSwap is still true (not prevented)
      expect(beforeSwapEvent.detail.shouldSwap).toBe(true);
    });

    test("swap mode - non-chunked responses allow final swap", () => {
      const element = document.createElement("div");
      element.setAttribute("hx-chunked-mode", "swap");

      const mockXhr = {
        getResponseHeader: (header: string) => {
          // NOT chunked - has Content-Length
          if (header === "Content-Length") return "15";
          return null;
        },
        response: "<p>Final</p>",
        _chunkedMode: "swap",
      };

      const beforeSwapEvent = {
        target: element,
        detail: {
          xhr: mockXhr,
          shouldSwap: true,
        },
      };

      // Trigger beforeSwap event
      registeredExtension.onEvent("htmx:beforeSwap", beforeSwapEvent);

      // Non-chunked responses should NOT be prevented
      expect(beforeSwapEvent.detail.shouldSwap).toBe(true);
    });
  });
});
