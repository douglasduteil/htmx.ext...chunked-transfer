//

import type { HtmxExtension } from "htmx.org";

//

(function () {
  let api: HtmxApi;

  htmx.defineExtension("chunked-transfer", {
    init: function (apiRef: HtmxApi) {
      api = apiRef;
    },
    onEvent: function (name, evt) {
      const elt = evt.target as Element;

      if (name === "htmx:beforeRequest") {
        const xhr = evt.detail.xhr as XMLHttpRequest;
        xhr.onprogress = function () {
          let response = xhr.response as string;

          api.withExtensions(elt, function (extension) {
            if (!extension.transformResponse) return;
            response = extension.transformResponse(response, xhr, elt);
          });

          var swapSpec = api.getSwapSpecification(elt);
          var target = api.getTarget(elt);
          var settleInfo = api.makeSettleInfo(elt);
          api.selectAndSwap(
            swapSpec.swapStyle,
            target,
            elt,
            response,
            settleInfo
          );
          api.settleImmediately(settleInfo.tasks);
        };
      }
    },
  } as HtmxExtension & { init: (apiRef: any) => void });
})();

//

declare global {
  var htmx: typeof import("htmx.org");
  interface Window {
    htmx: typeof import("htmx.org");
  }
}

//
// Inspired by https://github.com/delaneyj/nothtmx2

interface HtmxApi {
  defineExtension(name: string, extension: HtmxExtension): void;
  getSwapSpecification(elt: Element): { swapStyle: string };
  getTarget(elt: Element): Element;
  makeSettleInfo(elt: Element): SettleInfo;
  selectAndSwap(
    swapStyle: string,
    target: Element,
    elt: Element,
    responseText: string,
    settleInfo: SettleInfo
  ): void;
  settleImmediately(tasks: Task[]): void;
  withExtensions(
    elt: Element,
    callback: (extension: HtmxExtension) => void
  ): void;
}

interface SettleInfo {
  title?: string;
  elts: Element[];
  tasks: Task[];
}

export type Task = () => void;
