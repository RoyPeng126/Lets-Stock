import * as echarts from 'echarts';
import { apiFetch } from '@/utils/api.js';
import '@/lib/sbadmin2/css/sb-admin-2.min.css';
import { CandlestickChart, LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, TitleComponent, DataZoomComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([CandlestickChart, LineChart, GridComponent, TooltipComponent, LegendComponent, TitleComponent, DataZoomComponent, CanvasRenderer]);

const $ = s => document.querySelector(s);

// 預設近 90 天
function setDefaultDates() {
  const to = new Date();
  const from = new Date(); from.setDate(to.getDate() - 90);
  const fmt = d => d.toISOString().slice(0,10);
  $('#from').value = fmt(from);
  $('#to').value = fmt(to);
}

async function fetchTrack(symbol, from, to, signal) {
  const qs = new URLSearchParams({ from: from || '', to: to || '' }).toString();
  const res = await apiFetch(`/api/stocks/track/${symbol}?${qs}`, { signal });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json(); // { symbol, data: [{trade_date, open, high, low, close, volume}, ...] }
}

// 技術指標：MA / BB / RSI（簡易）
function MA(arr, period, pick) {
  const out = Array(arr.length).fill(null);
  let sum = 0; let q = [];
  for (let i=0;i<arr.length;i++){
    const v = pick(arr[i]);
    q.push(v); sum += v;
    if (q.length > period) sum -= q.shift();
    if (q.length === period) out[i] = +(sum/period).toFixed(2);
  }
  return out;
}
function RSI(arr, period, pickClose) {
  const out = Array(arr.length).fill(null);
  let gain = 0, loss = 0;
  for (let i=1;i<arr.length;i++){
    const diff = pickClose(arr[i]) - pickClose(arr[i-1]);
    gain += Math.max(0, diff);
    loss += Math.max(0, -diff);
    if (i >= period){
      // 移動窗
      const diffOld = pickClose(arr[i-period+1]) - pickClose(arr[i-period]);
      gain -= Math.max(0, diffOld);
      loss -= Math.max(0, -diffOld);
      const rs = loss === 0 ? 100 : gain / loss;
      out[i] = +(100 - (100/(1+rs))).toFixed(2);
    }
  }
  return out;
}

document.addEventListener('DOMContentLoaded', () => {
  setDefaultDates();

  const chartMain = echarts.init(document.getElementById('chart-main'));
  const chartRSI  = echarts.init(document.getElementById('chart-rsi'));

  let controller = null;

  async function query() {
    const sym = ($('#symbol').value || 'AAPL').trim().toUpperCase();
    const from = $('#from').value;
    const to   = $('#to').value;

    $('#queryBtn')?.setAttribute('disabled','true');
    $('#loadingOverlay')?.classList.remove('d-none');

    controller = new AbortController();
    const signal = controller.signal;

    try {
      const { data } = await fetchTrack(sym, from, to, signal);

      const dates = data.map(r => r.trade_date);
      const ohlc  = data.map(r => [Number(r.open), Number(r.close), Number(r.low), Number(r.high)]);
      const close = data.map(r => Number(r.close));

      const ma5  = MA(data, 5,  r => Number(r.close));
      const ma10 = MA(data, 10, r => Number(r.close));
      const ma20 = MA(data, 20, r => Number(r.close));
      const rsi14 = RSI(data, 14, r => Number(r.close));

      // K 線
        chartMain.setOption({
        title: {
            text: `${sym} K 線`,
            top: 6,
            left: 'center',
            // 給標題一點底部空隙，避免貼到 legend
            padding: [0, 0, 10, 0],
            textStyle: { fontSize: 14, fontWeight: 700 }
        },
        // legend 往下移，並加大項目間距
        legend: { top: 40, itemGap: 16 },

        // 圖區再往下，避開 title + legend（這個是關鍵）
        grid: { left: 56, right: 16, top: 92, bottom: 64 },

        tooltip: { trigger: 'axis' },
        xAxis: { type: 'category', data: dates, boundaryGap: true, axisLine:{ onZero:false } },
        yAxis: { scale: true },
        dataZoom: [{ type:'inside' }, { type:'slider', height: 18 }],
        series: [
            { type: 'candlestick', name: 'K', data: ohlc },
            { type: 'line', name: 'MA5',  data: ma5,  smooth: true, showSymbol: false },
            { type: 'line', name: 'MA10', data: ma10, smooth: true, showSymbol: false },
            { type: 'line', name: 'MA20', data: ma20, smooth: true, showSymbol: false },
        ]
        });

      // RSI
        chartRSI.setOption({
        grid: { left: 56, right: 16, top: 12, bottom: 28 },
        xAxis: { type: 'category', data: dates, boundaryGap: false, axisLabel: { show: false } },
        yAxis: { type: 'value', min: 0, max: 100 },
        series: [{ type: 'line', name: 'RSI(14)', data: rsi14, smooth: true, showSymbol: false }],
        tooltip: { trigger: 'axis' }
        });
    } catch (e) {
      if (e.name !== 'AbortError') alert(e.message || '查詢失敗');
      console.error(e);
    } finally {
      $('#loadingOverlay')?.classList.add('d-none');
      $('#queryBtn')?.removeAttribute('disabled');
    }
  }

  $('#queryBtn').addEventListener('click', query);
  $('#cancelQuery').addEventListener('click', () => {
    controller?.abort();
    $('#cancelQuery').setAttribute('disabled','true');
  });
});