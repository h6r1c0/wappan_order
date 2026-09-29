import React from 'react';

const paths = {
  basket: <><path d="M3 10h18l-2 10H5L3 10Z"/><path d="m7 10 4-7m6 7-4-7M9 14v3m6-3v3"/></>,
  assign: <><rect x="4" y="3" width="12" height="17" rx="2"/><path d="M8 8h4m-4 4h4m5 3 2 2 3-4"/></>,
  history: <><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6m-6 4h6m-6 4h3"/></>,
  buyer: <><circle cx="12" cy="8" r="3"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
  bread: <><path d="M3 14c0-5 4-9 9-9s9 4 9 9v4c0 1-1 2-2 2H5c-1 0-2-1-2-2v-4Z"/><path d="m9 9-2 3m7-4-2 3m6 1-2 3"/></>,
  excel: <><path d="M5 3h10l4 4v14H5V3Z"/><path d="M15 3v5h4M8 12l4 5m0-5-4 5m7-5v5"/></>,
  totals: <><path d="M4 20V4m0 16h17M8 17v-5m5 5V8m5 9V5"/></>,
  delivery: <><path d="M3 7h11v10H3V7Zm11 3h4l3 3v4h-7v-7Z"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/></>,
  coins: <><circle cx="8" cy="15" r="5"/><path d="M9 7a5 5 0 0 1 10 0v9a5 5 0 0 1-5 5h-2M9 4h10M9 10h10"/></>,
  shop: <><path d="M3 10h18l-2-6H5l-2 6Zm2 0v11h14V10M9 21v-7h6v7"/></>,
};

export function TaskIcon({ type, className = '' }) {
  return <svg className={`task-icon ${className}`} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true" focusable="false">{paths[type]}</svg>;
}
