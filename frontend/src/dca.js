// src/dca.js
import '@/lib/sbadmin2/css/sb-admin-2.min.css'
import 'tabulator-tables/dist/css/tabulator.min.css'
import 'choices.js/public/assets/styles/choices.min.css'

import { apiFetch } from '@/utils/api.js'
import { showError } from './utils.js'
import Choices from 'choices.js'
import flatpickr from 'flatpickr'
import { Mandarin } from 'flatpickr/dist/l10n/zh'
import { TabulatorFull as Tabulator } from 'tabulator-tables'
import * as echarts from 'echarts'
import { notify } from '@/utils/notification.js';
let table = null
let chart = null
let currentController = null

const ymd = d => {
  const dt = new Date(d)
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const day = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
const fmtMoney = n => (n == null || isNaN(n)) ? '$0' : '$' + Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
const fmtPct   = n => (n == null || isNaN(n)) ? '-' : (Number(n) * 100).toFixed(2) + '%'

function defaultRange(days = 30) {
  const to = new Date()
  const from = new Date()
  from.setDate(to.getDate() - days)
  return { from: ymd(from), to: ymd(to) }
}

document.addEventListener('DOMContentLoaded', () => {
  // 多選股票
  const sel = document.getElementById('symbols')
  if (sel) {
    new Choices(sel, {
      removeItemButton: true,
      shouldSort: false,
      itemSelectText: ''
    })
  }

  // 日期
  const { from, to } = defaultRange(90)
  flatpickr('#from', { locale: Mandarin, dateFormat: 'Y-m-d', defaultDate: from, allowInput: true })
  flatpickr('#to',   { locale: Mandarin, dateFormat: 'Y-m-d', defaultDate: to,   allowInput: true })

  // 讓「頻率/週月份日」高度跟 input 一樣
  const refH = getComputedStyle(document.getElementById('from')).height
  ;['freq','day'].forEach(id => {
    const el = document.getElementById(id)
    if (el) { el.classList.add('form-control'); el.style.height = refH; el.style.lineHeight = refH }
  })

  // 圖表容器至少給高度
  const chartEl = document.getElementById('chart-dca')
  if (chartEl && (!chartEl.style.height || chartEl.clientHeight < 100)) chartEl.style.height = '360px'

  // 事件（按鈕與表單都接）
  document.getElementById('simulateBtn')?.addEventListener('click', (e) => { e.preventDefault(); simulate() })
  document.getElementById('dcaForm')?.addEventListener('submit', (e) => { e.preventDefault(); simulate() })

  simulate() // 頁面進來跑一次
})

function getSelectedSymbols() {
  const sel = document.getElementById('symbols')
  if (!sel) return []
  return Array.from(sel.options)
    .filter(o => o.selected)
    .map(o => o.value.trim().toUpperCase())
    .filter(Boolean)
}

async function simulate() {
  const symbols = getSelectedSymbols()
  if (!symbols.length) return showError('請至少選擇一個股票代碼')

  const amountPerPeriod = Number(document.getElementById('amount')?.value || 0)
  if (!amountPerPeriod || amountPerPeriod <= 0) return showError('請輸入有效的每期投入金額')

  const from = document.getElementById('from')?.value || ''
  const to   = document.getElementById('to')?.value || ''
  if (!from || !to || new Date(from) > new Date(to)) return showError('請確認起訖日期')

  const freq = (document.getElementById('freq')?.value || 'weekly').toLowerCase() // weekly / monthly
  const day  = Number(document.getElementById('day')?.value || 1) // 週 / 月份的日

  setBusy(true)

  currentController = new AbortController()
  const signal = currentController.signal

  try {
    // 1) 取各股票走勢
    const tracks = await Promise.all(
      symbols.map(async s => {
        const qs = new URLSearchParams({ from, to, _t: Date.now() }).toString()
        const res = await apiFetch(`/api/stocks/track/${encodeURIComponent(s)}?${qs}`, { cache: 'no-store', signal })
        if (!res.ok) throw new Error(`讀取 ${s} 失敗 (HTTP ${res.status})`)
        return await res.json() // { symbol, data:[{ trade_date, close, ...}] }
      })
    )

    // 2) 轉每天收盤 Map
    const mapBySym = {}
    for (const t of tracks) {
      const m = new Map()
      for (const r of (t.data || [])) {
        const d = String(r.trade_date).slice(0, 10)
        const px = Number(r.close)
        if (isFinite(px)) m.set(d, px)
      }
      mapBySym[t.symbol] = m
    }

    // 3) 產生扣款排程
    const schedule = buildSchedule(from, to, freq, day)

    // 4) 逐期共同交易日下單
    const perSym = amountPerPeriod / symbols.length
    const ledger = []
    const holding = Object.fromEntries(symbols.map(s => [s, 0]))
    const equitySeries = []

    for (const d of schedule) {
      const tradeDate = nearestCommonDate(d, mapBySym, symbols, 10) // 找所有股票都有資料的最近日期
      if (!tradeDate) continue

      // 下單
      symbols.forEach(s => {
        const px = mapBySym[s].get(tradeDate)
        if (!px) return
        const shares = perSym / px
        holding[s] += shares
        ledger.push({ date: tradeDate, symbol: s, price: px, invest: perSym, shares })
      })

      // 當日總市值
      const val = symbols.reduce((sum, s) => sum + (mapBySym[s].get(tradeDate) || 0) * holding[s], 0)
      equitySeries.push([tradeDate, val])
    }

    // 5) 統計
    const invested   = ledger.reduce((s, r) => s + r.invest, 0)
    const lastValDay = lastCommonDate(mapBySym, symbols, to, 10)
    const finalValue = lastValDay
      ? symbols.reduce((s, sym) => s + (mapBySym[sym].get(lastValDay) || 0) * holding[sym], 0)
      : (equitySeries.at(-1)?.[1] || 0)
    const profit = finalValue - invested
    const roi    = invested ? profit / invested : 0

    // 6) 畫面
    renderMetrics({ invested, finalValue, profit, roi })
    notify.simulateOk({ name: '定期定額模擬', invested, roi });
    renderChart(equitySeries)
    renderTable(ledger)

    if (!ledger.length) showError('期間內沒有可成交的共同交易日，請調整頻率或日期範圍。')
  } catch (err) {
    if (err.name !== 'AbortError') {
      console.error(err)
      showError(err.message || '模擬失敗')
    }
  } finally {
    setBusy(false)
  }
}

function buildSchedule(from, to, freq, day) {
  const s = []
  const start = new Date(from)
  const end   = new Date(to)

  if (freq === 'weekly') {
    // day: 1..7（Mon..Sun）
    const want = Math.min(Math.max(Number(day) || 1, 1), 7)
    const jsDow = (start.getDay() + 6) % 7 + 1 // JS: Sun=0 => 7
    const delta = (want - jsDow + 7) % 7
    let d = new Date(start)
    d.setDate(d.getDate() + delta)
    while (d <= end) { s.push(ymd(d)); d.setDate(d.getDate() + 7) }
  } else {
    // monthly：超過月底就用月底
    let cur = new Date(start.getFullYear(), start.getMonth(), 1)
    while (cur <= end) {
      const y = cur.getFullYear(), m = cur.getMonth()
      const last = new Date(y, m + 1, 0).getDate()
      const dd = Math.min(Math.max(Number(day) || 1, 1), last)
      const cand = new Date(y, m, dd)
      if (cand >= start && cand <= end) s.push(ymd(cand))
      cur = new Date(y, m + 1, 1)
    }
  }
  return s
}

function nearestCommonDate(dateStr, mapBySym, syms, forwardDays = 10) {
  const base = new Date(dateStr)
  for (let k = 0; k <= forwardDays; k++) {
    const d = ymd(new Date(base.getTime() + k * 86400000))
    if (syms.every(s => mapBySym[s]?.has(d))) return d
  }
  return null
}
function lastCommonDate(mapBySym, syms, to, backDays = 10) {
  const base = new Date(to)
  for (let k = 0; k <= backDays; k++) {
    const d = ymd(new Date(base.getTime() - k * 86400000))
    if (syms.every(s => mapBySym[s]?.has(d))) return d
  }
  return null
}

function renderMetrics({ invested, finalValue, profit, roi }) {
  const box = document.getElementById('dca-metrics')
  if (!box) return
  box.innerHTML = `
    <div class="col-12 col-md-3"><div class="apple-stat"><div class="label">投入總額</div><div class="value">${fmtMoney(invested)}</div></div></div>
    <div class="col-12 col-md-3"><div class="apple-stat"><div class="label">期末市值</div><div class="value">${fmtMoney(finalValue)}</div></div></div>
    <div class="col-12 col-md-3"><div class="apple-stat"><div class="label">損益金額</div><div class="value">${fmtMoney(profit)}</div></div></div>
    <div class="col-12 col-md-3"><div class="apple-stat"><div class="label">報酬率</div><div class="value">${fmtPct(roi)}</div></div></div>
  `
}

function renderChart(seriesPairs) {
  const el = document.getElementById('chart-dca')
  if (!el) return
  if (!el.style.height || el.clientHeight < 100) el.style.height = '360px'
  if (!chart) chart = echarts.init(el)

  const data = (seriesPairs || []).map(([d, v]) => ({ value: [d, Number(v) || 0] }))
  chart.setOption({
    grid: { top: 48, left: 56, right: 24, bottom: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'time' },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: val => '$' + Number(val).toLocaleString() }
    },
    legend: { top: 8 },
    series: [{
      name: '市值',
      type: 'line',
      smooth: true,
      showSymbol: false,
      data
    }]
  })
  requestAnimationFrame(() => chart.resize())
  window.addEventListener('resize', () => chart && chart.resize())
}

function renderTable(rows) {
  const el = document.getElementById('dca-table')
  if (!el) return
  el.style.minWidth = '720px'

  const cols = [
    { title: '日期',  field: 'date',   hozAlign: 'left' },
    { title: '股票',  field: 'symbol', hozAlign: 'left' },
    { title: '價格',  field: 'price',  hozAlign: 'right',
      formatter: c => c.getValue() == null ? '' :
        Number(c.getValue()).toLocaleString(undefined, { maximumFractionDigits: 4 })
    },
    { title: '投入',  field: 'invest', hozAlign: 'right', formatter: c => fmtMoney(c.getValue()) },
    { title: '股數',  field: 'shares', hozAlign: 'right',
      formatter: c => c.getValue() == null ? '' :
        Number(c.getValue()).toLocaleString(undefined, { maximumFractionDigits: 6 })
    }
  ]

  if (!table) {
    table = new Tabulator(el, {
      data: rows,
      layout: 'fitDataStretch',
      reactiveData: true,
      pagination: true,
      paginationSize: 20,
      columns: cols
    })
  } else {
    table.setColumns(cols)
    table.replaceData(rows)
  }
}

function setBusy(b) {
  const ov = document.getElementById('loadingOverlay')
  const btn = document.getElementById('simulateBtn')
  if (b) {
    ov?.classList.remove('d-none')
    btn?.setAttribute('disabled', 'true')
  } else {
    ov?.classList.add('d-none')
    btn?.removeAttribute('disabled')
  }
}
