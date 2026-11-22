import React from "react";
import { createRoot } from "react-dom/client";

function HistorySummary({ totals, money }) {
  return (
    <>
      <div className="summary-tile">
        <dt>Vendas líquidas de estornos{" "}
          <small>Total de todos os dias, excluindo as vendas estornadas.</small>
        </dt>
        <dd>{money(totals.gross)}</dd>
      </div>
      <div className="summary-tile cash-tile"><dt>Caixa líquido</dt><dd>{money(totals.cashNet)}</dd></div>
      <div className="summary-tile"><dt>A receber</dt><dd>{money(totals.pending)}</dd></div>
      <div className="summary-tile"><dt>A reembolsar</dt><dd>{money(totals.refundPending)}</dd></div>
    </>
  );
}

export function mountHistorySummary(element, money) {
  const root = createRoot(element);
  return (totals) => root.render(totals ? <HistorySummary totals={totals} money={money} /> : null);
}
