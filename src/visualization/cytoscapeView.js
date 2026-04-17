(function () {
  let cy;

  window.addEventListener("message", (event) => {
    const message = event.data;

    switch (message.type) {
      case "updateGraph":
        if (cy) {
          cy.destroy();
        }

        const svgMinus =
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="2" width="20" height="20" fill="gray" rx="4"/><rect x="6" y="11" width="12" height="2" fill="white"/></svg>',
          );
        const svgPlus =
          "data:image/svg+xml;utf8," +
          encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24"><rect x="2" y="2" width="20" height="20" fill="gray" rx="4"/><rect x="6" y="11" width="12" height="2" fill="white"/><rect x="11" y="6" width="2" height="12" fill="white"/></svg>',
          );

        cy = cytoscape({
          container: document.getElementById("cy"),
          elements: message.elements,
          style: [
            {
              selector: "node",
              style: {
                "background-color": "#666",
                label: "data(id)",
              },
            },
            {
              selector: ".box-node",
              style: {
                shape: "round-rectangle",
                "background-color": "white",
                "border-width": "4px",
                "border-style": "solid",
                "border-color": "rgba(162, 162, 162, 0.5)",
                "font-size": `12px`,
                "font-weight": "bold",

                label: "data(label)",
                "text-valign": "bottom",
                "text-halign": "right",
                "text-margin-y": function (node) {
                  return -Math.max(node.outerHeight() || 100, 100) + 12;
                },
                "text-margin-x": function (node) {
                  const hasIcon = node.hasClass("collapsed") || node.isParent();
                  return (
                    -Math.max(node.outerWidth() || 200, 200) +
                    (hasIcon ? 36 : 12)
                  );
                },
                "text-wrap": "ellipsis",
                "text-max-width": function (node) {
                  const hasIcon = node.hasClass("collapsed") || node.isParent();
                  return node.outerWidth &&
                    typeof node.outerWidth === "function"
                    ? Math.max(node.outerWidth() || 200, 200) -
                        (hasIcon ? 48 : 24) +
                        "px"
                    : "76px";
                },
                padding: "20px",
                "padding-top": "40px",
                "padding-bottom": "20px",
                "background-image": function (node) {
                  if (node.hasClass("collapsed")) {
                    return svgPlus;
                  }
                  if (node.isParent()) {
                    return svgMinus;
                  }
                  return null;
                },
                "background-position-x": "12px",
                "background-position-y": "12px",
                "background-width": "16px",
                "background-height": "16px",
                "background-fit": "none",
                "background-clip": "none",
              },
            },
            {
              selector: ".box-node:childless",
              style: {
                height: "100px",
              },
            },
            {
              selector: ".box-node.collapsed",
              style: {
                height: "100px",
              },
            },
            {
              selector: ".box-node:active",
              style: {
                "border-color": "rgb(25, 151, 197)",
                "background-color": "rgb(183, 222, 236)",
                "border-style": "solid",
                "border-opacity": 1,
                "overlay-opacity": 0,
              },
            },
            {
              selector: "edge",
              style: {
                width: 2,
                "line-color": "#ccc",
                "target-arrow-color": "#ccc",
                "target-arrow-shape": "triangle",
                "curve-style": "taxi",
                "taxi-direction": "downward",
                "taxi-turn": 20,
                "taxi-turn-min-distance": 5,
              },
            },
            {
              selector: ".layout-order-edge",
              style: {
                width: 0,
                "line-opacity": 0,
                "target-arrow-shape": "none",
                "source-arrow-shape": "none",
              },
            },
          ],
          layout: {
            name: "preset",
          },
        });

        const debugFlagValue =
          document.body && document.body.dataset
            ? document.body.dataset.cytoscapeDebug
            : undefined;
        const isCytoscapeDebugEnabled = debugFlagValue === "true";

        // Always expose the instance for debugging in webview devtools.
        window.__cy = cy;
        window.__cyDebug = {
          enabled: isCytoscapeDebugEnabled,
          flagValue: debugFlagValue,
        };

        if (isCytoscapeDebugEnabled) {
          console.info("[cytoscape-debug] window.__cy is available");
        } else {
          console.info(
            "[cytoscape-debug] window.__cy exposed; CYTOSCAPE_DEBUG is not true",
          );
        }

        const cyContainer = document.getElementById("cy");

        function applyDomStyles(element, styles) {
          Object.assign(element.style, styles);
        }

        function applyCyStyles(elements, styles) {
          elements.style(styles);
        }

        function stabilizeBoxLabels() {
          cy.nodes(".box-node").forEach((node) => {
            const width = Math.max(node.outerWidth() || 200, 200);
            const height = Math.max(node.outerHeight() || 100, 100);
            const hasIcon = node.hasClass("collapsed") || node.isParent();

            applyCyStyles(node, {
              "text-margin-y": -height + 12,
              "text-margin-x": -width + (hasIcon ? 36 : 12),
            });
          });
        }

        // Zoom-aware font sizing
        const BASE_FONT_SIZE = 12;
        const MIN_FONT_SIZE = 8;
        const LABEL_HIDE_ZOOM_THRESHOLD = 0.3;
        let zoomFontRafId = null;

        function logZoomSnapshot() {
          const zoomValue = cy.zoom() || 1;

          console.log("[zoom-debug]", {
            zoom: Number(zoomValue.toFixed(4)),
          });
        }

        let zoomLevelIndicator = document.getElementById("cy-zoom-indicator");
        if (!zoomLevelIndicator) {
          zoomLevelIndicator = document.createElement("div");
          zoomLevelIndicator.id = "cy-zoom-indicator";
          applyDomStyles(zoomLevelIndicator, {
            position: "fixed",
            top: "8px",
            left: "8px",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            fontWeight: "600",
            zIndex: "1001",
            pointerEvents: "none",
            backgroundColor:
              "var(--vscode-editorHoverWidget-background, rgba(0,0,0,0.8))",
            color: "var(--vscode-editorHoverWidget-foreground, white)",
            border: "1px solid var(--vscode-editorHoverWidget-border, #444)",
          });
          document.body.appendChild(zoomLevelIndicator);
        }

        function updateZoomLevelDisplay() {
          zoomLevelIndicator.textContent =
            "Zoom: " + (cy.zoom() || 1).toFixed(2) + "x";
        }

        function applyZoomAwareNodeFontSize() {
          const zoomFactor = cy.zoom() || 1;
          const computedFontSize = Math.max(
            BASE_FONT_SIZE / zoomFactor,
            MIN_FONT_SIZE,
          );
          const shouldHideLabels = zoomFactor < LABEL_HIDE_ZOOM_THRESHOLD;
          const boxNodes = cy.nodes(".box-node");

          applyCyStyles(boxNodes, {
            "font-size": computedFontSize + "px",
            "text-opacity": shouldHideLabels ? 0 : 1,
          });
          stabilizeBoxLabels();
          updateZoomLevelDisplay();
          logZoomSnapshot();
        }

        applyZoomAwareNodeFontSize();
        cy.on("zoom", () => {
          if (zoomFontRafId !== null) {
            window.cancelAnimationFrame(zoomFontRafId);
          }
          zoomFontRafId = window.requestAnimationFrame(() => {
            applyZoomAwareNodeFontSize();
            zoomFontRafId = null;
          });
        });

        cy.nodes().forEach((node, index) => {
          node.data("orderIndex", index);
        });

        function rebuildSiblingOrderEdges() {
          cy.edges(".layout-order-edge").remove();

          const orderEdges = [];
          const pushOrderEdgesForSiblings = (siblings, groupId) => {
            const ordered = siblings
              .toArray()
              .sort(
                (a, b) =>
                  (a.data("orderIndex") || 0) - (b.data("orderIndex") || 0),
              );

            for (let i = 0; i < ordered.length - 1; i += 1) {
              const source = ordered[i];
              const target = ordered[i + 1];
              orderEdges.push({
                data: {
                  id: `order-edge-${groupId}-${i}`,
                  source: source.id(),
                  target: target.id(),
                },
                classes: "layout-order-edge",
              });
            }
          };

          const rootNodes = cy
            .nodes()
            .filter((node) => node.parent().length === 0);
          pushOrderEdgesForSiblings(rootNodes, "root");

          cy.nodes().forEach((parentNode) => {
            if (!parentNode.isParent()) {
              return;
            }
            pushOrderEdgesForSiblings(
              parentNode.children(),
              `parent-${parentNode.id()}`,
            );
          });

          if (orderEdges.length > 0) {
            cy.add(orderEdges);
          }
        }

        function calculateStretchedWidths() {
          // Accurate CSS constraints applied to every .box-node
          const CYTOSCAPE_PADDING = 48; // 20px padding L/R + 4px border L/R
          const ELK_PADDING = 40; // 20px padding inside parent L/R
          const TOTAL_PADDING = CYTOSCAPE_PADDING + ELK_PADDING; // 88px total delta
          const MIN_WIDTH = 200;

          applyCyStyles(cy.nodes(), {
            width: null,
            height: null,
          });

          // 1. Bottom-up natural widths
          const nodes = cy
            .nodes()
            .toArray()
            .sort((a, b) => b.ancestors().length - a.ancestors().length);
          nodes.forEach((node) => {
            let maxChildWidth = 0;
            node.children().forEach((child) => {
              const cw = child.data("naturalWidth") || MIN_WIDTH;
              if (cw > maxChildWidth) {
                maxChildWidth = cw;
              }
            });

            let nw = MIN_WIDTH;
            if (node.isParent()) {
              nw = Math.max(nw, maxChildWidth + TOTAL_PADDING);
            }
            node.data("naturalWidth", Math.max(nw, MIN_WIDTH));
          });

          // 2. Top-down layout application based on compound hierarchy roots
          const rootNodes = cy
            .nodes()
            .filter((node) => node.parent().length === 0);
          function applyStretchedWidth(node, parentLayoutWidth) {
            let finalWidth = node.data("naturalWidth");
            if (parentLayoutWidth !== undefined && parentLayoutWidth > 0) {
              const stretched = parentLayoutWidth - TOTAL_PADDING;
              finalWidth = Math.max(finalWidth, stretched);
            }
            applyCyStyles(node, {
              width: finalWidth + "px",
              "min-width": finalWidth + "px",
            });
            node.children().forEach((child) => {
              applyStretchedWidth(child, finalWidth);
            });
          }

          let containerWidth =
            cy.width() || cy.container().clientWidth || window.innerWidth;
          let maxRootInnerWidth = containerWidth - CYTOSCAPE_PADDING; // max available inner space for roots

          rootNodes.forEach((root) => {
            if (root.data("naturalWidth") > maxRootInnerWidth) {
              maxRootInnerWidth = root.data("naturalWidth");
            }
          });

          let virtualParentWidth = maxRootInnerWidth + TOTAL_PADDING;
          rootNodes.forEach((root) => {
            applyStretchedWidth(root, virtualParentWidth); // Root container is the whole graph
          });
        }

        function applyElkLayout() {
          rebuildSiblingOrderEdges();
          calculateStretchedWidths(); // Apply block-level widths first
          const layout = cy.layout({
            name: "elk",
            animate: true,
            animationDuration: 300,
            nodeLayoutOptions: function (node) {
              if (node.isParent()) {
                return {
                  "elk.algorithm": "layered",
                  "elk.direction": "DOWN",
                  "elk.layered.spacing.nodeNodeBetweenLayers": 20,
                  "elk.spacing.nodeNode": 20,
                  "elk.padding": "[top=40,bottom=20,left=20,right=20]",
                };
              }
              return {};
            },
            elk: {
              algorithm: "layered",
              "elk.direction": "DOWN",
              nodeDimensionsIncludeLabels: true,
              "elk.padding": "[top=40,bottom=20,left=20,right=20]",
              "elk.spacing.nodeNode": 20,
              "elk.layered.spacing.nodeNodeBetweenLayers": 20,
              "elk.hierarchyHandling": "INCLUDE_CHILDREN",
              "elk.separateConnectedComponents": false,
            },
          });

          layout.on("layoutstop", () => {
            stabilizeBoxLabels();
          });
          layout.run();
        }

        function relayoutAfterHierarchyChange() {
          // Wait one frame so Cytoscape fully reflects restore/remove changes.
          window.requestAnimationFrame(() => {
            applyElkLayout();
          });
        }

        applyElkLayout();

        // Expand/Collapse Logic (Coordinate Checking)
        cy.on("tap", ".box-node", (e) => {
          const node = e.target;
          const isCollapsed = node.hasClass("collapsed");

          if (!node.isParent() && !isCollapsed) {
            return; // No children to toggle
          }

          const pos = e.position;
          const bb = node.boundingBox();
          const buttonX = bb.x1 + 12;
          const buttonY = bb.y1 + 12;

          // 16x16 button area
          if (
            pos.x >= buttonX &&
            pos.x <= buttonX + 16 &&
            pos.y >= buttonY &&
            pos.y <= buttonY + 16
          ) {
            if (isCollapsed) {
              const children = node.data("collapsedChildren");
              if (children && children.length > 0) {
                children.restore();
                node.removeClass("collapsed");
                relayoutAfterHierarchyChange();
              }
            } else {
              const descendants = node.descendants();
              const edges = descendants.connectedEdges();
              const elementsToRemove = descendants.union(edges);

              node.data("collapsedChildren", elementsToRemove);
              cy.remove(elementsToRemove);
              node.addClass("collapsed");

              relayoutAfterHierarchyChange();
            }
          }
        });

        // Simple DOM Tooltip
        let cyTooltip = document.getElementById("cy-tooltip");
        if (!cyTooltip) {
          cyTooltip = document.createElement("div");
          cyTooltip.id = "cy-tooltip";
          applyDomStyles(cyTooltip, {
            position: "absolute",
            display: "none",
            backgroundColor:
              "var(--vscode-editorHoverWidget-background, rgba(0,0,0,0.8))",
            color: "var(--vscode-editorHoverWidget-foreground, white)",
            border: "1px solid var(--vscode-editorHoverWidget-border, #444)",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "12px",
            zIndex: "1000",
            pointerEvents: "none",
          });
          document.body.appendChild(cyTooltip);
        }

        let hoverTimeout;

        cy.on("mouseover", "node", (e) => {
          const node = e.target;

          clearTimeout(hoverTimeout);

          hoverTimeout = setTimeout(() => {
            cyTooltip.innerHTML = node.data("label");
            applyDomStyles(cyTooltip, { display: "block" });
          }, 500);
        });

        cy.on("mousemove", "node", (e) => {
          const node = e.target;
          const pos = e.position;

          if (node.isParent() || node.hasClass("collapsed")) {
            const bb = node.boundingBox();
            const buttonX = bb.x1 + 12;
            const buttonY = bb.y1 + 12;

            if (
              pos.x >= buttonX &&
              pos.x <= buttonX + 16 &&
              pos.y >= buttonY &&
              pos.y <= buttonY + 16
            ) {
              if (cyContainer) {
                applyDomStyles(cyContainer, { cursor: "pointer" });
              }
            } else {
              if (cyContainer) {
                applyDomStyles(cyContainer, { cursor: "default" });
              }
            }
          }

          applyDomStyles(cyTooltip, {
            left: e.originalEvent.pageX + 10 + "px",
            top: e.originalEvent.pageY + 10 + "px",
          });
        });

        cy.on("mouseout", "node", () => {
          clearTimeout(hoverTimeout);
          applyDomStyles(cyTooltip, { display: "none" });
          if (cyContainer) {
            applyDomStyles(cyContainer, { cursor: "default" });
          }
        });

        break;
    }
  });
})();
