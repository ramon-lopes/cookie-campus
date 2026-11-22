import React from "react";
import { createRoot } from "react-dom/client";

const stockIconsById = new Map([
  ["f0", "nutella"], ["f1", "tradicional"], ["f2", "red"], ["f3", "red"],
  ["f4", "black"], ["f5", "black"], ["6837b8cf-64a6-4e78-8cd1-649d3ba7fce5", "tradicional"],
]);
const stockIconsByName = new Map([
  ["black bueno", "black"], ["laka com oreo", "tradicional"], ["ninho com nutella", "tradicional"],
  ["nutella", "nutella"], ["oreo", "black"], ["oreo com nutella", "black"],
  ["red ninho", "red"], ["red nutella", "red"],
]);

function StockCard({ flavor, balances, formattedPrice }) {
  const { available, reserved, sold } = balances;
  const icon = stockIconsById.get(flavor.id) ?? stockIconsByName.get(flavor.name.trim().toLowerCase());
  const status = available ? "disponíveis" : reserved ? "Sem unidades livres" : "Esgotado";
  return (
    <article className="card stock-card">
      <div className="stock-top">
        {icon && <img className="stock-icon" src={`./icons/cookies-${icon}.png`} width="24" height="24" alt="" />}
        <div>
          <h3>{flavor.name}{flavor.active ? "" : " (inativo)"}</h3>
          <div className="price">{formattedPrice}</div>
        </div>
      </div>
      <div className={available ? "stock-available" : "stock-available stock-zero"}>
        <strong>{available}</strong><span>{status}</span>
      </div>
      <dl className="stock-info">
        <div className={!available && reserved ? "reserved-highlight" : undefined}>
          <dt>Reservados</dt><dd>{reserved}</dd>
        </div>
        <div><dt>Vendidos</dt><dd>{sold}</dd></div>
      </dl>
    </article>
  );
}

export function mountStockCards(element, money) {
  const root = createRoot(element);
  return (cards) => root.render(cards.map(({ flavor, balances }) => (
    <StockCard key={flavor.id} flavor={flavor} balances={balances} formattedPrice={money(flavor.price)} />
  )));
}
