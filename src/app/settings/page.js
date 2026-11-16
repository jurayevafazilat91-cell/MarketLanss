"use client";

import { useRef, useState } from "react";
import { FileSpreadsheet, FileUp, LoaderCircle } from "lucide-react";
import { useApp } from "@/components/app-context";
import { Button, Card, ErrorMessage, PageHeader, SuccessMessage } from "@/components/ui";
import { createInventoryImport, parseUpload } from "@/lib/data";

export default function SettingsPage() {
  const { imports, language, t, save, notify } = useApp();
  const inventoryFileInput = useRef(null);
  const [inventoryFile, setInventoryFile] = useState(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const activeInventory = imports.filter((item) => item.reportType === "products").at(-1);

  async function deleteData() {
    if (!window.confirm(t("deleteAllConfirm"))) return;
    setError("");
    setSuccess("");
    try {
      await save([]);
      setSuccess(t("noImports"));
      notify(t("noImports"));
    } catch (saveError) {
      setError(saveError.message);
    }
  }

  async function replaceInventory(event) {
    event.preventDefault();
    if (!inventoryFile) return;
    setError("");
    setSuccess("");
    setInventoryBusy(true);
    try {
      const parsed = await parseUpload(inventoryFile);
      const inventoryImport = createInventoryImport({
        fileName: inventoryFile.name,
        headers: parsed.headers,
        rows: parsed.rows,
        parseWarnings: parsed.parseWarnings,
      });
      const otherImports = imports.filter((item) => item.reportType !== "products");
      await save([...otherImports, inventoryImport], language, []);
      setInventoryFile(null);
      if (inventoryFileInput.current) inventoryFileInput.current.value = "";
      setSuccess(t("inventorySourceDone"));
      notify(t("inventorySourceDone"));
    } catch (importError) {
      const message = importError.message;
      if (message === "INVENTORY_COLUMNS") setError(t("inventorySourceColumnsError"));
      else if (message === "INVENTORY_ROWS") setError(t("inventorySourceRowsError"));
      else if (message.startsWith("Choose a CSV")) setError(t("typeError"));
      else if (message.startsWith("Files must be")) setError(t("sizeError"));
      else if (message.includes("100,000")) setError(t("rowLimitError"));
      else if (message.includes("no usable data rows")) setError(t("noDataRowsError"));
      else if (message.includes("needs a header row")) setError(t("headerError"));
      else if (message.startsWith("Could not parse CSV")) setError(t("csvParseError"));
      else if (message.includes("no readable worksheets")) setError(t("worksheetError"));
      else setError(message);
    } finally {
      setInventoryBusy(false);
    }
  }

  return (
    <>
      <PageHeader title={t("settingsTitle")} description={t("settingsSub")} />
      <ErrorMessage>{error}</ErrorMessage><SuccessMessage>{success}</SuccessMessage>
      <div className="dashboard-grid">
        <Card className="section-card">
          <div className="section-heading"><h2>{t("profile")}</h2></div>
          <div className="settings-list">
            <div>{t("profile")}</div><div>{t("user")}</div>
            <div>{t("authLabel")}</div><div>{t("authValue")}</div>
            <div>{t("localStorage")}</div><div>{t("storageValue")}</div>
            <div>{t("records")}</div><div>{imports.length} {t("uploads").toLowerCase()}</div>
          </div>
        </Card>
        <Card className="section-card">
          <div className="section-heading"><h2>{t("inventorySource")}</h2></div>
          <form onSubmit={replaceInventory}>
            <div className="section-body">
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.65 }}>{t("inventorySourceHelp")}</p>
              <p className="muted" style={{ fontSize: 12 }}>
                {t("inventorySourceCurrent")}: <strong>{activeInventory?.fileName || t("inventorySourceNone")}</strong>
              </p>
              <label className="field">{t("fileLabel")}
                <div className="upload-drop">
                  <FileSpreadsheet size={22} />
                  <strong>{inventoryFile ? inventoryFile.name : t("dropFile")}</strong>
                  <p>{t("fileRestrictions")}</p>
                  <input
                    ref={inventoryFileInput}
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={(event) => {
                      setInventoryFile(event.target.files?.[0] ?? null);
                      setError("");
                      setSuccess("");
                    }}
                    aria-label={t("fileLabel")}
                  />
                </div>
              </label>
              <Button type="submit" disabled={inventoryBusy || !inventoryFile}>
                {inventoryBusy ? <LoaderCircle className="spin" size={15} /> : <FileUp size={15} />}
                {inventoryBusy ? t("inventorySourceReplacing") : t("inventorySourceReplace")}
              </Button>
            </div>
          </form>
        </Card>
        <Card className="section-card">
          <div className="section-heading"><h2>{t("dataManagement")}</h2></div>
          <div className="section-body">
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.65 }}>Deleting all imports removes their standardized rows and removes them from all analysis screens.</p>
            <Button variant="danger" onClick={deleteData} disabled={!imports.length}>{t("deleteAll")}</Button>
            <div className="message message-error" style={{ marginTop: 16 }}>{t("securityNote")}</div>
          </div>
        </Card>
      </div>
    </>
  );
}
