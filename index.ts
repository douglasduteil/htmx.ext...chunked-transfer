//

import type { HtmxExtension } from "htmx.org";
import type htmxType from "htmx.org";

//

declare const htmx: typeof htmxType;

//

(function () {
  let api: HtmxApi;

  // Helper function to detect chunked transfer (HTTP/1.1) or streaming (HTTP/2)
  function isChunkedTransfer(xhr: XMLHttpRequest): boolean {
    const te = xhr.getResponseHeader("Transfer-Encoding");
    const cl = xhr.getResponseHeader("Content-Length");
    const isHttp1Chunked = te === "chunked";
    const isStreamingWithoutLength = !te && !cl; // typical HTTP/2 streaming
    return isHttp1Chunked || isStreamingWithoutLength;
  }

  htmx.defineExtension("chunked-transfer", {
    init: function (apiRef: HtmxApi) {
      api = apiRef;
    },
    onEvent: function (name, evt) {
      const elt = evt.target as Element;
      const target = api.getTarget(elt);

      if (name === "htmx:beforeRequest") {
        const xhr = evt.detail.xhr as XMLHttpRequest;
        (xhr as any)._chunkedMode =
          elt.getAttribute("hx-chunked-mode") || "append";
        (xhr as any)._chunkedLastLen = 0;

        xhr.onprogress = function () {
          if (!isChunkedTransfer(xhr)) return;

          const swapSpec = api.getSwapSpecification(elt);
          if (swapSpec.swapStyle !== "innerHTML") return;

          const mode = (xhr as any)._chunkedMode || "append";
          const full = (xhr.response as string) ?? "";
          let response: string;

          if (mode === "swap") {
            const lastLen = (xhr as any)._chunkedLastLen || 0;
            if (full.length <= lastLen) return;
            response = full.slice(lastLen);
            (xhr as any)._chunkedLastLen = full.length;
          } else {
            response = full;
          }

          // Skip comment-only chunks (heartbeats), but allow empty chunks through
          const hasComment = /<!--[\s\S]*?-->/.test(response);
          const stripped = response.replace(/<!--[\s\S]*?-->/g, "").trim();
          if (hasComment && stripped.length === 0) return;

          api.withExtensions(elt, function (extension) {
            if (!extension.transformResponse) return;
            response = extension.transformResponse(response, xhr, elt);
          });

          const settleInfo = api.makeSettleInfo(elt);

          if (api.swap) {
            // Pass contextElement to enable OOB swap processing (Issue #117)
            api.swap(target, response, swapSpec, {
              contextElement: elt,
            } as any);
          } else {
            api.selectAndSwap(
              swapSpec.swapStyle,
              target,
              elt,
              response,
              settleInfo,
            );
          }
          api.settleImmediately(settleInfo.tasks);
        };
      }

      // Keep: cancel final full swap in swap mode
      if (name === "htmx:beforeSwap") {
        const detail = evt.detail as any;
        const xhr = detail && (detail.xhr as XMLHttpRequest | undefined);
        if (!xhr) return;

        const mode = (xhr as any)._chunkedMode;
        if (mode !== "swap") return;

        if (!isChunkedTransfer(xhr)) return;

        detail.shouldSwap = false;
      }
    },
  } as HtmxExtension & { init: (apiRef: any) => void });
})();

//
// Inspired by https://github.com/delaneyj/nothtmx2

interface HtmxApi {
  defineExtension(name: string, extension: HtmxExtension): void;
  getSwapSpecification(elt: Element): SwapSpec;
  getTarget(elt: Element): Element;
  makeSettleInfo(elt: Element): SettleInfo;
  selectAndSwap( // HTMX 1.0
    swapStyle: string,
    target: Element,
    elt: Element,
    responseText: string,
    settleInfo: SettleInfo,
  ): void;
  swap( // HTMX 2.0
    target: Element,
    content: string,
    swapSpec: SwapSpec,
    swapOptions?: SwapOptions,
  ): void;
  settleImmediately(tasks: Task[]): void;
  withExtensions(
    elt: Element,
    callback: (extension: HtmxExtension) => void,
  ): void;
}

interface SwapSpec {
  swapStyle: string;
  swapDelay: Number;
  settleDelay: Number;
  transition: Boolean;
  ignoreTitle: Boolean;
  head: string;
  // scroll, scrollTarget, show, showTarget, focusScroll
}

interface SwapOptions {
  select?: string;
  selectOOB?: string;
  eventInfo?: Object;
  anchor?: Element;
  contextElement?: Element;
  afterSwapCallback?: () => void;
  afterSettleCallback?: () => void;
}

interface SettleInfo {
  title?: string;
  elts: Element[];
  tasks: Task[];
}

export type Task = () => void;
