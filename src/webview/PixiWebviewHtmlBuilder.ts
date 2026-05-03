import * as fs from "fs";
import { PixiWebviewResourceUris } from "./contracts";

/** Builds webview HTML by injecting runtime resource URIs into the template. */
export class PixiWebviewHtmlBuilder {
  public buildFromTemplate(
    templatePath: string,
    resources: PixiWebviewResourceUris,
  ): string {
    let htmlContent = fs.readFileSync(templatePath, "utf8");

    htmlContent = htmlContent.replace(
      "${pixiImportUrl}",
      resources.pixiImportUrl,
    );
    htmlContent = htmlContent.replace(
      "${pixiViewportImportUrl}",
      resources.pixiViewportImportUrl,
    );
    htmlContent = htmlContent.replace(
      "${d3HierarchyImportUrl}",
      resources.d3HierarchyImportUrl,
    );
    htmlContent = htmlContent.replace("${scriptUri}", resources.scriptUri);
    htmlContent = htmlContent.replace("${toolkitUri}", resources.toolkitUri);
    htmlContent = htmlContent.replace("${codiconUri}", resources.codiconUri);

    return htmlContent;
  }
}
