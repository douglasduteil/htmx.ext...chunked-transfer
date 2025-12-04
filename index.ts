//

import type { HtmxExtension } from "htmx.org";
import type htmxType from "htmx.org";

//

declare const htmx: typeof htmxType;

//

(function () {
  let api: HtmxApi;

  htmx.defineExtension("chunked-transfer", {
    init: function (apiRef: HtmxApi) {
      api = apiRef;
    },
    onEvent: function (name, evt) {
      const elt = evt.target as Element;
      const target = api.getTarget(elt);

      if (name === "htmx:beforeRequest") {
        const xhr = evt.detail.xhr as XMLHttpRequest;
        xhr.onprogress = function () {
          const is_chunked =
            xhr.getResponseHeader("Transfer-Encoding") === "chunked";

          if (!is_chunked) return;

          let response = xhr.response as string;

          api.withExtensions(elt, function (extension) {
            if (!extension.transformResponse) return;
            response = extension.transformResponse(response, xhr, elt);
          });

          var swapSpec = api.getSwapSpecification(elt);
          var settleInfo = api.makeSettleInfo(elt);
          if (api.swap) {
            api.swap(target, response, swapSpec);
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
  select: string;
  selectOOB: string;
  eventInfo: Object;
  anchor: Element;
  contextElement: Element;
  afterSwapCallback: () => void;
  afterSettleCallback: () => void;
}

interface SettleInfo {
  title?: string;
  elts: Element[];
  tasks: Task[];
}

export type Task = () => void;
