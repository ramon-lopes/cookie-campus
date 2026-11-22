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
const quantity = new Intl.NumberFormat("pt-BR");

function StockCard({ flavor, balances, formattedPrice }) {
  const { available, reserved, sold } = balances;
  const icon = stockIconsById.get(flavor.id) ?? stockIconsByName.get(flavor.name.trim().toLowerCase());
  const status = available ? "Disponíveis" : reserved ? "Sem unidades livres" : "Esgotado";
  return (
    <article className="stock-card tw:grid tw:min-w-0 tw:grid-rows-[auto_1fr_auto] tw:gap-[0.75rem] tw:rounded-[1rem] tw:bg-white tw:p-[0.75rem]">
      <div className="stock-top tw:flex tw:items-start tw:gap-[0.5rem]">
        {icon && <img className="stock-icon tw:shrink-0" src={`./icons/cookies-${icon}.png`} width="24" height="24" alt="" />}
        <div>
          <h3>{flavor.name}{flavor.active ? "" : " (inativo)"}</h3>
          <div className="price">{formattedPrice}</div>
        </div>
      </div>
      <div className="stock-available tw:flex tw:flex-wrap tw:items-baseline" data-balance={available ? "available" : reserved ? "held" : "empty"}>
        <strong>{quantity.format(available)}</strong><span>{status}</span>
      </div>
      <dl className="stock-info">
        <div className={reserved ? "reserved-highlight" : undefined}>
          <dt>Reservados</dt><dd>{quantity.format(reserved)}</dd>
        </div>
        <div><dt>Vendidos</dt><dd>{quantity.format(sold)}</dd></div>
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
