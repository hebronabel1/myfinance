import { useState, useEffect, useRef } from 'react'
import './App.css'

// ─── CONSTANTS ───────────────────────────────────────────────────────────────
const PW = 'myFinance2026'
const API = 'https://quizmind-api.vercel.app/api/chat'
const MODEL = 'claude-sonnet-4-20250514'
const DISCLAIMER = 'This is for educational purposes only. Consult a licensed financial advisor before making major financial decisions.'
const SOURCES = ['NerdWallet','Bankrate','Fidelity','CFPB','IRS.gov','MyFico','Schwab','Vanguard','Chase','Experian','Equifax','TransUnion','Investopedia','The Balance','WSJ','SEC.gov','FINRA','Morningstar','BlackRock','JP Morgan','Motley Fool','Kiplinger','Forbes Advisor']

const JSPDF_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'
const AUTOTABLE_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'
const XLSX_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
const EXCELJS_CDN = 'https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js'
const CHARTJS_CDN = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'

// ─── THEME ───────────────────────────────────────────────────────────────────
const TH = d => ({
  bg:   d ? '#0d1f14' : '#f4faf6',
  bg2:  d ? '#152b1d' : '#ffffff',
  bg3:  d ? '#1a3526' : '#e8f5ed',
  text: d ? '#d1e8d7' : '#1a2e22',
  t2:   d ? '#7fb893' : '#4a7a5c',
  bdr:  d ? '#2a4d35' : '#b8d9c4',
  acc:  '#1DB954',
  acc2: '#1a5c3a',
  accH: '#17a349',
  err:  d ? '#ff6b6b' : '#cc2222',
})

// ─── PREV SCREEN MAP ─────────────────────────────────────────────────────────
const PREV = {
  menu:'gate',
  budget_1:'menu', budget_2:'budget_1', budget_4:'budget_2', budget_result:'budget_4',
  credit_menu:'menu',
  cc_1:'credit_menu', cc_2:'cc_1', cc_3:'cc_2', cc_4:'cc_3', cc_result:'cc_4',
  cs_1:'credit_menu', cs_2:'cs_1', cs_3:'cs_2', cs_4:'cs_3', cs_5:'cs_4', cs_result:'cs_5',
  bank_1:'menu', bank_2:'bank_1', bank_3:'bank_2', bank_4:'bank_3', bank_result:'bank_4',
  finance_1:'menu', finance_2:'finance_1', finance_result:'finance_2',
  invest_1:'menu',
  invest_s2:'invest_1', invest_s3:'invest_s2', invest_s4:'invest_s3', invest_s5:'invest_s4', invest_s6:'invest_s5', invest_result:'invest_s6',
  invest_l2:'invest_1', invest_l3:'invest_l2', invest_l4:'invest_l3', invest_l5:'invest_l4', invest_l6:'invest_l5', invest_l7:'invest_l6',
}

// ─── UTILITIES ───────────────────────────────────────────────────────────────
const fmtDollar = raw => {
  const n = String(raw).replace(/[^0-9]/g, '')
  if (!n) return ''
  return '$' + n.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}
const parseDollar = str => parseInt(String(str).replace(/[^0-9]/g, ''), 10) || 0
const fmtNum = n => '$' + Math.round(n).toLocaleString()

const loadScript = src => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve()
  const s = document.createElement('script')
  s.src = src; s.onload = resolve; s.onerror = reject
  document.head.appendChild(s)
})

const callAI = async (prompt, signal) => {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
    signal,
  })
  return (await res.json()).content[0].text
}

const extractJSON = raw => {
  const m = raw.match(/\{[\s\S]*\}/)
  if (!m) throw new Error('No JSON found')
  return JSON.parse(m[0])
}

const calcAmortization = (principal, annualRate, termYears) => {
  const r = annualRate / 100 / 12
  const n = termYears * 12
  if (n === 0 || principal === 0) return { payment: 0, yearly: [] }
  const payment = r === 0 ? principal / n : (principal * r * Math.pow(1+r,n)) / (Math.pow(1+r,n) - 1)
  let balance = principal
  const monthly = []
  for (let i = 0; i < n; i++) {
    const interest = balance * r
    const princ = Math.min(payment - interest, balance)
    balance = Math.max(0, balance - princ)
    monthly.push({ interest, princ, balance })
  }
  const yearly = []
  for (let y = 0; y < termYears; y++) {
    const slice = monthly.slice(y*12, (y+1)*12)
    yearly.push({
      year: y+1,
      principalPaid: slice.reduce((s,m) => s+m.princ, 0),
      interestPaid: slice.reduce((s,m) => s+m.interest, 0),
      balance: slice[slice.length-1]?.balance ?? 0,
    })
  }
  return { payment, yearly }
}

// ─── DOLLAR INPUT (module scope — stable reference, no focus loss) ───────────
function DollarInput({ value, onChange, placeholder='$0', T }) {
  const inputRef = useRef(null)
  const handleChange = e => {
    const cursorPos = e.target.selectionStart
    const oldLen = e.target.value.length
    const raw = e.target.value.replace(/[^0-9]/g, '')
    const formatted = raw ? '$' + parseInt(raw,10).toLocaleString() : ''
    onChange(formatted)
    requestAnimationFrame(() => {
      if (!inputRef.current) return
      const newLen = inputRef.current.value.length
      const delta = newLen - oldLen
      const newPos = Math.max(1, Math.min(cursorPos + delta, newLen))
      inputRef.current.setSelectionRange(newPos, newPos)
    })
  }
  return (
    <input ref={inputRef} value={value} onChange={handleChange} placeholder={placeholder}
      inputMode="numeric"
      style={{ padding:'11px 14px', borderRadius:9, border:`1.5px solid ${T.bdr}`, background:T.bg3,
        color:T.text, fontFamily:'inherit', fontSize:15, width:'100%', outline:'none',
        boxSizing:'border-box' }} />
  )
}

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {

  // ── Core state ──
  const [screen, setScreen] = useState('gate')
  const [dark, setDark] = useState(true)
  const [pwInput, setPwInput] = useState('')
  const [pwErr, setPwErr] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [aiErr, setAiErr] = useState(false)
  const T = TH(dark)

  // ── Budget state ──
  const [budgetPeriods, setBudgetPeriods] = useState([])
  const [budgetIncomes, setBudgetIncomes] = useState({})
  const [budgetExpenses, setBudgetExpenses] = useState([])
  const [budgetCustom, setBudgetCustom] = useState('')
  const [budgetAmounts, setBudgetAmounts] = useState({})
  const [budgetViewPeriod, setBudgetViewPeriod] = useState('')
  const [budgetStyle, setBudgetStyle] = useState('')
  const [budgetSavingsPrompt, setBudgetSavingsPrompt] = useState(false)

  // ── Credit Cards state ──
  const [ccFee, setCcFee] = useState('')
  const [ccScore, setCcScore] = useState('')
  const [ccGoals, setCcGoals] = useState([])
  const [ccIncome, setCcIncome] = useState('')

  // ── Credit Score state ──
  const [csGoals, setCsGoals] = useState([])
  const [csGoalOther, setCsGoalOther] = useState('')
  const [csScore, setCsScore] = useState('')
  const [csStruggles, setCsStruggles] = useState([])
  const [csStruggleOther, setCsStruggleOther] = useState('')
  const [csCards, setCsCards] = useState('')
  const [csPayment, setCsPayment] = useState('')
  const [csOldest, setCsOldest] = useState('')

  // ── Banking state ──
  const [bankLooking, setBankLooking] = useState('')
  const [bankCurrent, setBankCurrent] = useState('')
  const [bankPref, setBankPref] = useState('')
  const [bankPriorities, setBankPriorities] = useState([])

  // ── Financing state ──
  const [financeType, setFinanceType] = useState('')
  const [downPayment, setDownPayment] = useState('')
  const [loanAmount, setLoanAmount] = useState('')
  const [loanTerm, setLoanTerm] = useState('30')
  const [interestRate, setInterestRate] = useState('')
  const chartRef = useRef(null)
  const chartInstance = useRef(null)

  // ── Download preview state ──
  const [dlPreview, setDlPreview] = useState(null)

  // ── Investing state ──
  const [investType, setInvestType] = useState('')
  const [investGoal, setInvestGoal] = useState('')
  const [investGoalOther, setInvestGoalOther] = useState('')
  const [investTimeline, setInvestTimeline] = useState('')
  const [investStart, setInvestStart] = useState('')
  const [investMonthly, setInvestMonthly] = useState('')
  const [investRisk, setInvestRisk] = useState('')
  const [investHas401k, setInvestHas401k] = useState('')

  // ── Font + global transition injection ──
  useEffect(() => {
    const s = document.createElement('style')
    s.textContent = "@import url('https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap');"
    document.head.appendChild(s)
    const ks = document.createElement('style')
    ks.textContent = `@keyframes spin{to{transform:rotate(360deg)}}@keyframes fadeUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}`
    document.head.appendChild(ks)
    const ts = document.createElement('style')
    ts.textContent = `body,div,span,p,h1,h2,h3,button,input,select,td,th,li,a,label{transition:background-color 0.35s ease,color 0.3s ease,border-color 0.35s ease,box-shadow 0.2s ease;}`
    document.head.appendChild(ts)
  }, [])

  // ── Chart rendering for amortization ──
  useEffect(() => {
    if (screen !== 'finance_result') return
    const p = Math.max(0, parseDollar(loanAmount) - parseDollar(downPayment))
    const r = parseFloat(interestRate) || 0
    const t = parseInt(loanTerm) || 0
    if (!p || !t) return
    loadScript(CHARTJS_CDN).then(() => {
      if (chartInstance.current) chartInstance.current.destroy()
      const { yearly } = calcAmortization(p, r, t)
      if (!yearly.length || !chartRef.current) return
      const ctx = chartRef.current.getContext('2d')
      let cumPrinc = 0, cumInt = 0
      const labels = yearly.map(y => `Yr ${y.year}`)
      const princData = yearly.map(y => { cumPrinc += y.principalPaid; return Math.round(cumPrinc) })
      const intData = yearly.map(y => { cumInt += y.interestPaid; return Math.round(cumInt) })
      const balData = yearly.map(y => Math.round(y.balance))
      chartInstance.current = new window.Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            { label:'Principal Paid', data:princData, borderColor:'#1a5c3a', backgroundColor:'transparent', tension:0.3 },
            { label:'Interest Paid',  data:intData,   borderColor:'#1DB954', backgroundColor:'transparent', tension:0.3 },
            { label:'Remaining Balance', data:balData, borderColor:'#888',   backgroundColor:'transparent', tension:0.3 },
          ]
        },
        options: {
          responsive:true, maintainAspectRatio:false,
          interaction:{ mode:'index', intersect:false },
          plugins:{ legend:{ position:'top', labels:{ color: T.text, font:{ family:'Sora' } } } },
          scales:{
            x:{ ticks:{ color:T.t2, font:{family:'Sora'} }, grid:{ color:T.bdr } },
            y:{ ticks:{ color:T.t2, font:{family:'Sora'}, callback:v=>'$'+v.toLocaleString() }, grid:{ color:T.bdr } }
          }
        }
      })
    })
  }, [screen, downPayment, loanAmount, loanTerm, interestRate])

  // ── Navigation ──
  const goBack = () => {
    const prev = PREV[screen]
    if (prev) setScreen(prev)
  }

  // ── AI trigger helpers ──
  const abortRef = useRef(null)
  const runAI = async (loadingScreen, resultScreen, buildPrompt, backScreen='menu') => {
    setAiErr(false)
    abortRef.current = new AbortController()
    setScreen(loadingScreen)
    try {
      const raw = await callAI(buildPrompt(), abortRef.current.signal)
      setAiResult(extractJSON(raw))
      setScreen(resultScreen)
    } catch(e) {
      if (e?.name === 'AbortError') { setScreen(backScreen); return }
      setAiErr(true)
      setAiResult(null)
      setScreen(resultScreen)
    }
  }

  // ── Budget helpers ──
  const EXPENSE_CATS = ['Car Note','Food & Drinks','Gas','Groceries','Health & Wellness','Insurance','Investment Contributions','Miscellaneous','Rent / Mortgage','Savings Contributions','Shopping','Subscriptions','Travel','Utilities']
  const PERIODS = ['Weekly','Monthly','Annually']

  const togglePeriod = p => {
    setBudgetPeriods(prev => {
      const next = prev.includes(p) ? prev.filter(x=>x!==p) : [...prev,p]
      if (next.length > 0 && !budgetViewPeriod) setBudgetViewPeriod(next[0])
      if (next.length > 0) setBudgetViewPeriod(vp => next.includes(vp) ? vp : next[0])
      return next
    })
  }

  const toggleExpense = cat => {
    setBudgetExpenses(prev => prev.includes(cat) ? prev.filter(x=>x!==cat) : [...prev,cat])
  }

  const addCustomExpense = () => {
    const name = budgetCustom.trim()
    if (!name || budgetExpenses.includes(name)) return
    setBudgetExpenses(prev => [...prev, name])
    setBudgetCustom('')
  }

  const getBudgetBalance = period => {
    const income = parseDollar(budgetIncomes[period] || '')
    const spent = budgetExpenses.reduce((s,cat) => {
      if (cat === 'Savings Contributions') return s  // savings is not an expense
      return s + parseDollar(budgetAmounts[cat]?.[period] || '')
    }, 0)
    return income - spent
  }

  const buildBudgetPrompt = () => `You are a professional financial advisor creating a personalized budget recommendation.

USER'S CURRENT BUDGET:
${budgetPeriods.map(p => `${p} Period:
  Income: ${budgetIncomes[p] || '$0'}
  Expenses:
${budgetExpenses.map(cat => `  - ${cat}: ${budgetAmounts[cat]?.[p] || '$0'}`).join('\n')}`).join('\n\n')}

BUDGET STYLE: ${budgetStyle}

For each selected period provide a "Recommended Budget" with specific dollar amounts for each expense category aligned with the "${budgetStyle}" approach. "Savings Contributions" must always be a line item and represents money going to the user's savings — it is not a traditional expense. The recommended Savings Contributions should equal Income minus the total of all other expenses.

Respond with ONLY valid JSON in this exact structure:
{
  "periods": {
    "Weekly": { "Rent / Mortgage": "$XXX", "Utilities": "$XXX", "Savings Contributions": "$XXX" },
    "Monthly": { ... },
    "Annually": { ... }
  },
  "summary": "2-3 sentence personalized explanation",
  "tips": ["tip1","tip2","tip3"]
}

Only include periods the user selected. Use the exact same expense category names. Ensure all expenses (excluding Savings Contributions) plus Savings Contributions equals income. ${DISCLAIMER}`

  // ── Credit Cards prompt ──
  const buildCCPrompt = () => `You are a credit card expert recommending real credit cards for a specific user.

USER PROFILE:
- Annual Fee Preference: ${ccFee}
- Credit Score Range: ${ccScore}
- Top Priorities (ranked): ${ccGoals.map((g,i) => `${i+1}. ${g}`).join(', ')}
- Monthly Income: ${ccIncome}

Recommend 6 specific, real, currently-available credit cards that best match this profile. Group them by the user's priority categories.

Respond with ONLY valid JSON:
{
  "cards": [
    { "name":"...", "issuer":"...", "annualFee":"...", "keyBenefit":"...", "why":"...", "scoreReq":"...", "category":"...", "network":"Visa|Mastercard|Amex|Discover" }
  ],
  "summary":"2-3 sentence personalized overview"
}

Only recommend real cards. ${DISCLAIMER}`

  // ── Credit Score prompt ──
  const buildCSPrompt = () => `You are a credit counseling expert creating a personalized credit improvement plan.

USER PROFILE:
- Goals: ${csGoals.join(', ')}${csGoalOther ? ` (Other: ${csGoalOther})` : ''}
- Current Credit Score Range: ${csScore}
- Main Struggles: ${csStruggles.join(', ')}${csStruggleOther ? ` (Other: ${csStruggleOther})` : ''}
- Number of Credit Cards: ${csCards}
- Pays Minimum Monthly: ${csPayment}
- Oldest Account Age: ${csOldest}

Create a detailed personalized step-by-step credit improvement plan.

Respond with ONLY valid JSON:
{
  "immediateActions": ["action1","action2","action3"],
  "shortTermActions": ["action1","action2","action3"],
  "longTermStrategy": ["step1","step2","step3"],
  "struggleTips": ["tip1","tip2"],
  "timeline": "realistic expectation text",
  "summary": "personalized 2-3 sentence overview",
  "sources": ["Source1","Source2","Source3","Source4","Source5"],
  "urls": [
    { "source":"Experian", "url":"https://...", "why":"brief reason" }
  ]
}

Provide exactly 5 sources and 5 URLs. Sources must only come from: ${SOURCES.join(', ')}
${DISCLAIMER}`

  // ── Banking prompt ──
  const buildBankPrompt = () => `You are a banking expert recommending the best bank accounts for a specific user.

USER PROFILE:
- Account Type: ${bankLooking}
- Current Bank: ${bankCurrent}
- Preference: ${bankPref}
- Top Priorities: ${bankPriorities.join(', ')}

Recommend exactly 7 specific real banks/accounts ranked from best to worst fit.

Respond with ONLY valid JSON:
{
  "recommendations": [
    { "rank":1, "name":"...", "keyFeature":"...", "apy":"...", "fees":"...", "why":"...", "format":"online|brick|both" }
  ],
  "summary":"2-3 sentence overview"
}

${DISCLAIMER}`

  // ── Investing prompt ──
  const buildInvestPrompt = () => `You are a certified financial planner creating personalized investment recommendations.

USER PROFILE:
- Horizon: ${investType === 'short' ? 'Short-Term' : 'Long-Term'}
- Goal: ${investGoal}${investGoalOther ? ` (${investGoalOther})` : ''}
- Timeline: ${investTimeline}
- Starting Amount: ${investStart}
- Monthly Contribution: ${investMonthly}
- Risk Tolerance: ${investRisk}
${investType === 'long' ? `- Has 401k/IRA: ${investHas401k}` : ''}

Provide exactly 7 specific investment recommendations tailored to this profile.
IMPORTANT: Only recommend investments traded on financial markets — stocks, stock ETFs/index funds, bonds, U.S. Treasuries, bond ETFs, derivatives (options/futures), commodities, REITs, or cryptocurrency. Do NOT recommend savings accounts, high-yield savings accounts, CDs (certificates of deposit), or money market accounts — those are bank products, not investments.

Respond with ONLY valid JSON:
{
  "summary":"3-4 sentence personalized overview",
  "investments":[
    { "name":"...", "whatItIs":"...", "whyItFits":"...", "howItTiesIn":"...", "exampleTicker":null }
  ],
  "sources":["Source1","Source2","Source3","Source4","Source5"],
  "urls":[
    { "source":"NerdWallet", "url":"https://...", "why":"..." }
  ]
}

Sources must only come from: ${SOURCES.join(', ')}
Provide exactly 7 investments and 7 URLs. ${DISCLAIMER}`

  // ── PDF generators ──
  const pdfHeader = (doc, module) => {
    doc.setFillColor(26,92,58)
    doc.rect(0,0,210,20,'F')
    doc.setTextColor(255,255,255)
    doc.setFont('helvetica','bold')
    doc.setFontSize(14)
    doc.text('myFinance',14,13)
    doc.setFont('helvetica','normal')
    doc.setFontSize(9)
    doc.text(`${module} — ${new Date().toLocaleDateString()}`,14,19)
    doc.setTextColor(30,30,30)
  }

  const pdfFooter = doc => {
    const h = doc.internal.pageSize.height
    doc.setFontSize(6.5)
    doc.setTextColor(140,140,140)
    doc.text(DISCLAIMER,14,h-8,{maxWidth:182})
  }

  const downloadCCPdf = async () => {
    await loadScript(JSPDF_CDN); await loadScript(AUTOTABLE_CDN)
    const { jsPDF } = window.jspdf
    const doc = new jsPDF()
    pdfHeader(doc,'Credit Card Recommendations')
    doc.setFontSize(11); doc.setFont('helvetica','normal')
    doc.setTextColor(30,30,30)
    let y = 30
    if (aiResult?.summary) {
      const lines = doc.splitTextToSize(aiResult.summary,182)
      doc.text(lines,14,y); y += lines.length*6+8
    }
    if (aiResult?.cards) {
      aiResult.cards.forEach((card,i) => {
        if (y > 240) { doc.addPage(); pdfHeader(doc,'Credit Card Recommendations'); y=30 }
        doc.setFillColor(245,252,248); doc.rect(12,y-5,186,32,'F')
        doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(26,92,58)
        doc.text(`${i+1}. ${card.name}`,16,y+2)
        doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60)
        doc.text(`Issuer: ${card.issuer || ''}  |  Annual Fee: ${card.annualFee || 'N/A'}  |  Score: ${card.scoreReq || ''}`,16,y+9)
        doc.text(`Key Benefit: ${card.keyBenefit || ''}`,16,y+15)
        const wl = doc.splitTextToSize(`Why it fits you: ${card.why || ''}`,178)
        doc.text(wl,16,y+21); y += 40
      })
    }
    pdfFooter(doc)
    doc.save(`myFinance-CreditCards-${Date.now()}.pdf`)
  }

  const downloadCSPdf = async () => {
    await loadScript(JSPDF_CDN); await loadScript(AUTOTABLE_CDN)
    const { jsPDF } = window.jspdf
    const doc = new jsPDF()
    pdfHeader(doc,'Credit Score Improvement Plan')
    let y = 30
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30)
    if (aiResult?.summary) {
      const lines = doc.splitTextToSize(aiResult.summary,182)
      doc.text(lines,14,y); y += lines.length*5+10
    }
    const sections = [
      { title:'Immediate Actions (Next 30 Days)', items:aiResult?.immediateActions, color:[255,243,205] },
      { title:'Short-Term Actions (1–6 Months)', items:aiResult?.shortTermActions, color:[209,236,224] },
      { title:'Long-Term Strategy (6–24 Months)', items:aiResult?.longTermStrategy, color:[204,232,255] },
      { title:'Tips for Your Struggles', items:aiResult?.struggleTips, color:[245,245,245] },
    ]
    sections.forEach(sec => {
      if (!sec.items?.length) return
      if (y > 230) { doc.addPage(); pdfHeader(doc,'Credit Score Improvement Plan'); y=30 }
      doc.setFillColor(...sec.color); doc.rect(12,y-4,186,8,'F')
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(26,92,58)
      doc.text(sec.title,14,y+2); y += 12
      doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(40,40,40)
      sec.items.forEach(item => {
        if (y > 270) { doc.addPage(); pdfHeader(doc,'Credit Score Improvement Plan'); y=30 }
        const lines = doc.splitTextToSize(`• ${item}`,176)
        doc.text(lines,16,y); y += lines.length*5+3
      })
      y += 4
    })
    if (aiResult?.timeline) {
      if (y > 250) { doc.addPage(); pdfHeader(doc,'Credit Score Improvement Plan'); y=30 }
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(26,92,58)
      doc.text('Expected Timeline',14,y); y+=7
      doc.setFont('helvetica','normal'); doc.setTextColor(40,40,40)
      const lines = doc.splitTextToSize(aiResult.timeline,182)
      doc.text(lines,14,y); y+=lines.length*5+10
    }
    if (aiResult?.urls?.length) {
      if (y>240){doc.addPage();pdfHeader(doc,'Credit Score Improvement Plan');y=30}
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(26,92,58)
      doc.text('Further Reading',14,y); y+=8
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(40,40,40)
      aiResult.urls.forEach(u => {
        if(y>270){doc.addPage();pdfHeader(doc,'Credit Score Improvement Plan');y=30}
        doc.text(`${u.source}: ${u.url}`,14,y); y+=5
      })
    }
    if (aiResult?.sources?.length) {
      y+=4
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(26,92,58)
      doc.text('Sources: '+aiResult.sources.join(' | '),14,y)
    }
    pdfFooter(doc)
    doc.save(`myFinance-CreditScore-${Date.now()}.pdf`)
  }

  const downloadBankPdf = async () => {
    await loadScript(JSPDF_CDN); await loadScript(AUTOTABLE_CDN)
    const { jsPDF } = window.jspdf
    const doc = new jsPDF()
    pdfHeader(doc,'Banking Recommendations')
    let y = 30
    if (aiResult?.summary) {
      doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30)
      const lines = doc.splitTextToSize(aiResult.summary,182)
      doc.text(lines,14,y); y += lines.length*5+10
    }
    if (aiResult?.recommendations) {
      aiResult.recommendations.forEach(rec => {
        if (y > 240) { doc.addPage(); pdfHeader(doc,'Banking Recommendations'); y=30 }
        doc.setFillColor(245,252,248); doc.rect(12,y-5,186,28,'F')
        doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(26,92,58)
        doc.text(`#${rec.rank}  ${rec.name}`,16,y+2)
        doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(60,60,60)
        doc.text(`APY: ${rec.apy||'N/A'}  |  Fees: ${rec.fees||'N/A'}  |  ${rec.format||''}`,16,y+9)
        const wl = doc.splitTextToSize(`${rec.keyFeature||''} — ${rec.why||''}`,178)
        doc.text(wl,16,y+15); y+=36
      })
    }
    pdfFooter(doc)
    doc.save(`myFinance-Banking-${Date.now()}.pdf`)
  }

  const downloadFinancePdf = async () => {
    await loadScript(JSPDF_CDN); await loadScript(AUTOTABLE_CDN)
    const { jsPDF } = window.jspdf
    const doc = new jsPDF()
    pdfHeader(doc,'Loan Amortization Report')
    const p = parseDollar(loanAmount), r = parseFloat(interestRate)||0, t = parseInt(loanTerm)||0
    const { payment, yearly } = calcAmortization(p,r,t)
    let y = 28
    doc.setFontSize(10); doc.setFont('helvetica','bold'); doc.setTextColor(26,92,58)
    doc.text('Loan Summary',14,y); y+=7
    doc.setFont('helvetica','normal'); doc.setTextColor(40,40,40)
    doc.text([
      `Type: ${financeType}`,
      `Loan Amount: ${fmtNum(parseDollar(loanAmount))}`,
      ...(parseDollar(downPayment) > 0 ? [`Down Payment: ${fmtNum(parseDollar(downPayment))}`] : []),
      `Amount Financed: ${fmtNum(p)}`,
      `Interest Rate: ${r}%`,
      `Term: ${t} years`,
      `Monthly Payment: ${fmtNum(payment)}`,
      `Total Interest: ${fmtNum(yearly.reduce((s,row)=>s+row.interestPaid,0))}`,
      `Total Paid: ${fmtNum(p+yearly.reduce((s,row)=>s+row.interestPaid,0))}`,
    ],14,y); y += parseDollar(downPayment) > 0 ? 68 : 60
    doc.autoTable({
      startY:y,
      head:[['Year','Principal Paid','Interest Paid','Balance']],
      body:yearly.map(row=>[row.year,fmtNum(row.principalPaid),fmtNum(row.interestPaid),fmtNum(row.balance)]),
      styles:{ fontSize:8, fontStyle:'normal' },
      headStyles:{ fillColor:[26,92,58], textColor:255 },
      alternateRowStyles:{ fillColor:[240,250,244] },
    })
    pdfFooter(doc)
    doc.save(`myFinance-Loan-${Date.now()}.pdf`)
  }

  const downloadInvestPdf = async () => {
    await loadScript(JSPDF_CDN); await loadScript(AUTOTABLE_CDN)
    const { jsPDF } = window.jspdf
    const doc = new jsPDF()
    pdfHeader(doc,'Investment Recommendations')
    let y = 28
    doc.setFontSize(10); doc.setFont('helvetica','normal'); doc.setTextColor(30,30,30)
    if (aiResult?.summary) {
      const lines = doc.splitTextToSize(aiResult.summary,182)
      doc.text(lines,14,y); y += lines.length*5+10
    }
    if (aiResult?.investments) {
      aiResult.investments.forEach((inv,i) => {
        if (y > 230) { doc.addPage(); pdfHeader(doc,'Investment Recommendations'); y=28 }
        doc.setFillColor(245,252,248); doc.rect(12,y-4,186,36,'F')
        doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.setTextColor(26,92,58)
        doc.text(`${i+1}. ${inv.name}${inv.exampleTicker?` (${inv.exampleTicker})`:''}`,16,y+3)
        doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(50,50,50)
        const w1 = doc.splitTextToSize(inv.whatItIs||'',174); doc.text(w1,16,y+10); y+=10+w1.length*4.5
        const w2 = doc.splitTextToSize(`Why it fits: ${inv.whyItFits||''}`,174); doc.text(w2,16,y+3); y+=w2.length*4.5+3
        const w3 = doc.splitTextToSize(`Goal connection: ${inv.howItTiesIn||''}`,174); doc.text(w3,16,y+3); y+=w3.length*4.5+10
      })
    }
    if (aiResult?.urls?.length) {
      if (y>240){doc.addPage();pdfHeader(doc,'Investment Recommendations');y=28}
      doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(26,92,58)
      doc.text('Further Reading',14,y); y+=8
      doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(40,40,40)
      aiResult.urls.forEach(u => {
        if(y>270){doc.addPage();pdfHeader(doc,'Investment Recommendations');y=28}
        doc.text(`${u.source}: ${u.url}`,14,y); y+=5
      })
    }
    if (aiResult?.sources?.length) {
      y+=4
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(26,92,58)
      doc.text('Sources: '+aiResult.sources.join(' | '),14,y)
    }
    pdfFooter(doc)
    doc.save(`myFinance-Investing-${Date.now()}.pdf`)
  }

  const downloadBudgetExcel = async () => {
    await loadScript(EXCELJS_CDN)
    const wb = new window.ExcelJS.Workbook()
    wb.creator = 'myFinance'; wb.created = new Date()
    const GREEN = { argb:'FF1a5c3a' }, ACCENT = { argb:'FF1DB954' }
    const LGREY = { argb:'FFf4faf6' }, WHITE = { argb:'FFFFFFFF' }
    const LGREEN = { argb:'FFd1e8d7' }, TOTBG = { argb:'FFe8f5ed' }
    const numFmt = '"$"#,##0'
    budgetPeriods.forEach(period => {
      const ws = wb.addWorksheet(period)
      ws.columns = [{ width:30 },{ width:26 },{ width:28 }]
      // Title
      ws.mergeCells('A1:C1')
      const t = ws.getCell('A1')
      t.value = `myFinance — ${period} Budget`
      t.font = { bold:true, size:14, color:GREEN, name:'Calibri' }
      t.alignment = { horizontal:'center' }
      ws.getRow(1).height = 26
      // Header
      const hRow = ws.addRow(['Category','Your Current Budget','AI Recommended Budget'])
      hRow.height = 20
      hRow.eachCell(cell => {
        cell.font = { bold:true, color:{ argb:'FFFFFFFF' }, name:'Calibri', size:11 }
        cell.fill = { type:'pattern', pattern:'solid', fgColor:GREEN }
        cell.alignment = { horizontal:'center', vertical:'middle' }
        cell.border = { bottom:{ style:'medium', color:ACCENT } }
      })
      // Income
      const iRow = ws.addRow(['Income', parseDollar(budgetIncomes[period]||''), parseDollar(aiResult?.periods?.[period]?.Income||'0')])
      iRow.height = 18
      iRow.eachCell((cell,c) => {
        cell.font = { bold:true, name:'Calibri', size:11 }
        cell.fill = { type:'pattern', pattern:'solid', fgColor:LGREEN }
        if (c>1) cell.numFmt = numFmt
      })
      // Expenses (exclude Savings Contributions — rendered separately below)
      const expenseCats = budgetExpenses.filter(c => c !== 'Savings Contributions')
      expenseCats.forEach((cat,idx) => {
        const row = ws.addRow([cat, parseDollar(budgetAmounts[cat]?.[period]||''), parseDollar(aiResult?.periods?.[period]?.[cat]||'0')])
        row.eachCell((cell,c) => {
          cell.font = { name:'Calibri', size:10 }
          cell.fill = { type:'pattern', pattern:'solid', fgColor:idx%2===0?LGREY:WHITE }
          if (c>1) cell.numFmt = numFmt
          cell.border = { bottom:{ style:'hair', color:{ argb:'FFb8d9c4' } } }
        })
      })
      // Totals (expenses only, not savings)
      const totCur = expenseCats.reduce((s,c)=>s+parseDollar(budgetAmounts[c]?.[period]||''),0)
      const totRec = expenseCats.reduce((s,c)=>s+parseDollar(aiResult?.periods?.[period]?.[c]||'0'),0)
      const tRow = ws.addRow(['Total Expenses', totCur, totRec])
      tRow.eachCell((cell,c) => {
        cell.font = { bold:true, name:'Calibri', size:11 }
        cell.fill = { type:'pattern', pattern:'solid', fgColor:TOTBG }
        if (c>1) cell.numFmt = numFmt
        cell.border = { top:{ style:'medium', color:ACCENT }, bottom:{ style:'thin', color:GREEN } }
      })
      // Savings Contributions
      const savCur = parseDollar(budgetAmounts['Savings Contributions']?.[period]||'')
      const savRec = parseDollar(aiResult?.periods?.[period]?.['Savings Contributions']||'0')
      const bRow = ws.addRow(['Savings Contributions', savCur, savRec])
      bRow.eachCell((cell,c) => {
        cell.font = { bold:true, name:'Calibri', size:12, color:ACCENT }
        cell.fill = { type:'pattern', pattern:'solid', fgColor:LGREEN }
        if (c>1) cell.numFmt = numFmt
        cell.border = { top:{ style:'medium', color:ACCENT }, bottom:{ style:'medium', color:ACCENT } }
      })
      ws.views = [{ state:'frozen', ySplit:2 }]
    })
    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer],{ type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `myFinance-Budget-${Date.now()}.xlsx`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // ── Shared UI helpers ──
  const card = (children, extra={}) => (
    <div style={{ background:T.bg2, border:`1px solid ${T.bdr}`, borderRadius:16, padding:28, ...extra }}>
      {children}
    </div>
  )

  const Chip = ({ label, selected, onToggle, badge, disabled }) => (
    <button onClick={onToggle} disabled={disabled}
      style={{ padding:'8px 18px', borderRadius:20, border:`1.5px solid ${selected?T.acc:T.bdr}`,
        background:selected?T.acc:T.bg3, color:selected?'#fff':T.text,
        cursor:disabled?'not-allowed':'pointer', fontWeight:selected?600:400,
        fontFamily:'inherit', fontSize:14, position:'relative', transition:'all 0.15s',
        opacity:disabled&&!selected?0.45:1 }}>
      {badge!=null && <span style={{ position:'absolute',top:-8,right:-8,background:T.acc2,color:'#fff',
        borderRadius:'50%',width:18,height:18,fontSize:10,display:'flex',alignItems:'center',justifyContent:'center' }}>{badge}</span>}
      {label}
    </button>
  )

  const RadioCard = ({ label, desc, selected, onSelect, icon, accent }) => (
    <div onClick={onSelect} style={{ padding:'16px 20px', border:`2px solid ${selected?T.acc:T.bdr}`,
      borderRadius:12, background:selected?(dark?'#0f2d1c':'#e8f5ed'):T.bg2,
      cursor:'pointer', transition:'all 0.15s', userSelect:'none' }}>
      {icon && <div style={{ fontSize:28, marginBottom:6 }}>{icon}</div>}
      <div style={{ fontWeight:600, color:selected?(accent||T.acc):T.text, fontSize:15 }}>{label}</div>
      {desc && <div style={{ color:T.t2, fontSize:13, marginTop:4, lineHeight:'1.4' }}>{desc}</div>}
    </div>
  )

  const PrimaryBtn = ({ label, onClick, disabled, style={} }) => (
    <button onClick={onClick} disabled={disabled}
      style={{ background:disabled?T.bdr:T.acc, color:'#fff', border:'none', borderRadius:10,
        padding:'12px 32px', fontSize:16, fontWeight:600, cursor:disabled?'not-allowed':'pointer',
        fontFamily:'inherit', transition:'background 0.15s', ...style }}>
      {label}
    </button>
  )

  const SecBtn = ({ label, onClick, style={} }) => (
    <button onClick={onClick}
      style={{ background:'transparent', color:T.acc, border:`1.5px solid ${T.acc}`, borderRadius:10,
        padding:'10px 24px', fontSize:15, fontWeight:600, cursor:'pointer', fontFamily:'inherit', ...style }}>
      {label}
    </button>
  )

  // DollarInput is defined at module scope (see below App) — use <DollarInput T={T} .../>

  const Label = ({ children }) => (
    <div style={{ color:T.t2, fontSize:13, fontWeight:600, marginBottom:6, textTransform:'uppercase', letterSpacing:'0.05em' }}>
      {children}
    </div>
  )

  const SectionTitle = ({ children }) => (
    <h2 style={{ color:T.text, fontWeight:700, fontSize:22, margin:'0 0 6px' }}>{children}</h2>
  )

  const SubTitle = ({ children }) => (
    <p style={{ color:T.t2, fontSize:15, margin:'0 0 24px' }}>{children}</p>
  )

  const LoadingScreen = ({ backScreen='menu' }) => (
    <div style={{ textAlign:'center', padding:'80px 20px', animation:'fadeUp 0.4s ease' }}>
      <div style={{ width:52,height:52,border:`4px solid ${T.bdr}`,borderTopColor:T.acc,
        borderRadius:'50%',animation:'spin 0.9s linear infinite',margin:'0 auto 28px' }} />
      <p style={{ color:T.text, fontSize:20, fontWeight:600, margin:'0 0 8px' }}>Analyzing your finances...</p>
      <p style={{ color:T.t2, fontSize:14 }}>This usually takes 10–20 seconds</p>
      <button onClick={() => { abortRef.current?.abort(); setScreen(backScreen) }}
        style={{ marginTop:28, background:'transparent', color:T.t2, border:`1px solid ${T.bdr}`,
          borderRadius:8, padding:'9px 28px', cursor:'pointer', fontFamily:'inherit', fontSize:14 }}>
        Cancel
      </button>
    </div>
  )

  const ErrorBlock = ({ onRetry }) => (
    <div style={{ textAlign:'center', padding:'40px 20px' }}>
      <p style={{ color:T.err, fontSize:16, marginBottom:16 }}>Something went wrong. Please try again.</p>
      <PrimaryBtn label="Retry" onClick={onRetry} />
    </div>
  )

  // ── Download Preview Modal ──
  const PreviewModal = () => {
    if (!dlPreview) return null
    return (
      <div onClick={e=>e.target===e.currentTarget&&setDlPreview(null)}
        style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.65)', zIndex:200,
          display:'flex', alignItems:'flex-end', justifyContent:'center' }}>
        <div style={{ background:T.bg2, borderRadius:'20px 20px 0 0', padding:'28px 24px 40px',
          width:'100%', maxWidth:640, animation:'fadeUp 0.3s ease', maxHeight:'82vh', overflowY:'auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:18, color:T.text }}>📄 {dlPreview.title}</div>
            <button onClick={()=>setDlPreview(null)}
              style={{ background:'transparent', border:'none', fontSize:24, cursor:'pointer', color:T.t2, lineHeight:1 }}>×</button>
          </div>
          <div style={{ marginBottom:24 }}>{dlPreview.preview}</div>
          <div style={{ display:'flex', gap:12 }}>
            <PrimaryBtn label="⬇ Download" style={{ flex:1 }}
              onClick={()=>{ dlPreview.doDownload(); setDlPreview(null) }} />
            <SecBtn label="Cancel" style={{ flex:1 }} onClick={()=>setDlPreview(null)} />
          </div>
        </div>
      </div>
    )
  }

  // ── NavBar ──
  const isLoading = screen.endsWith('_loading')
  const NavBar = () => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
      padding:'14px 28px', borderBottom:`1px solid ${T.bdr}`, background:T.bg2,
      position:'sticky', top:0, zIndex:10 }}>
      <span style={{ fontWeight:700, fontSize:22, cursor:'pointer', userSelect:'none' }}
        onClick={() => screen!=='gate' && setScreen('menu')}>
        <span style={{ color:T.t2 }}>my</span><span style={{ color:T.acc2 }}>Finance</span>
      </span>
      <div style={{ display:'flex', gap:10, alignItems:'center' }}>
        {screen!=='gate' && !isLoading && PREV[screen] && (
          <button onClick={goBack} style={{ background:'transparent', border:`1px solid ${T.bdr}`,
            borderRadius:8, padding:'6px 14px', color:T.t2, cursor:'pointer', fontFamily:'inherit', fontSize:14 }}>
            ← Back
          </button>
        )}
        <button onClick={() => setDark(d=>!d)}
          style={{ background:'transparent', border:`1px solid ${T.bdr}`, borderRadius:8,
            padding:'6px 12px', cursor:'pointer', fontSize:16 }}>
          {dark ? '☀️' : '🌙'}
        </button>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════
  // SCREEN RENDERERS
  // ══════════════════════════════════════════════════════════

  // ── GATE ──
  const renderGate = () => (
    <div style={{ minHeight:'calc(100vh - 60px)', display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width:'100%', maxWidth:380, animation:'fadeUp 0.4s ease' }}>
        {card(<>
          <div style={{ textAlign:'center', marginBottom:28 }}>
            <div style={{ fontSize:44, fontWeight:700, marginBottom:8 }}>
              <span style={{ color:T.t2 }}>my</span><span style={{ color:T.acc2 }}>Finance</span>
            </div>
            <p style={{ color:T.t2, fontSize:15, margin:0 }}>Your personal financial toolkit</p>
          </div>
          <Label>Access Code</Label>
          <input type="password" value={pwInput}
            onChange={e => { setPwInput(e.target.value); setPwErr(false) }}
            onKeyDown={e => e.key==='Enter' && (pwInput===PW ? setScreen('menu') : setPwErr(true))}
            placeholder="Enter access code"
            style={{ padding:'11px 14px', borderRadius:9, border:`1.5px solid ${pwErr?T.err:T.bdr}`,
              background:T.bg3, color:T.text, fontFamily:'inherit', fontSize:15, width:'100%',
              outline:'none', marginBottom:8 }} />
          {pwErr && <p style={{ color:T.err, fontSize:13, margin:'0 0 8px' }}>Incorrect code. Please try again.</p>}
          <PrimaryBtn label="Enter" style={{ width:'100%', marginTop:4 }}
            onClick={() => pwInput===PW ? setScreen('menu') : setPwErr(true)} />
        </>)}
      </div>
    </div>
  )

  // ── MAIN MENU ──
  const menuItems = [
    { id:'budget_1', icon:'📊', label:'Budgeting', desc:'Create a personalized AI-powered budget' },
    { id:'credit_menu', icon:'💳', label:'Credit', desc:'Explore credit cards or improve your score' },
    { id:'bank_1', icon:'🏦', label:'Banking', desc:'Find the best bank accounts for your needs' },
    { id:'finance_1', icon:'🏠', label:'Financing', desc:'Calculate loan payments and amortization' },
    { id:'invest_1', icon:'📈', label:'Investing', desc:'Get personalized investment recommendations' },
  ]

  const renderMenu = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>What would you like to do?</SectionTitle>
      <SubTitle>Select a financial tool to get started</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:16 }}>
        {menuItems.map(item => (
          <div key={item.id} onClick={() => setScreen(item.id)}
            style={{ padding:'22px 20px', borderTop:`1.5px solid ${T.bdr}`, borderRight:`1.5px solid ${T.bdr}`,
              borderBottom:`1.5px solid ${T.bdr}`, borderLeft:`4px solid ${T.acc}`, borderRadius:14,
              background:T.bg2, cursor:'pointer', transition:'all 0.15s', userSelect:'none' }}
            onMouseEnter={e => e.currentTarget.style.boxShadow=`0 4px 20px ${dark?'rgba(0,0,0,0.4)':'rgba(0,0,0,0.1)'}`}
            onMouseLeave={e => e.currentTarget.style.boxShadow='none'}>
            <div style={{ fontSize:32, marginBottom:10 }}>{item.icon}</div>
            <div style={{ fontWeight:700, fontSize:17, color:T.text, marginBottom:4 }}>{item.label}</div>
            <div style={{ color:T.t2, fontSize:13 }}>{item.desc}</div>
          </div>
        ))}
      </div>
    </div>
  )

  // ── BUDGET 1 — Periods + Income ──
  const renderBudget1 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Budget Period & Income</SectionTitle>
      <SubTitle>Select the period(s) you want to budget for</SubTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:12, marginBottom:28 }}>
        {PERIODS.map(p => (
          <Chip key={p} label={p} selected={budgetPeriods.includes(p)} onToggle={() => togglePeriod(p)} />
        ))}
      </div>
      {PERIODS.filter(p => budgetPeriods.includes(p)).map(p => (
        <div key={p} style={{ marginBottom:16 }}>
          {card(<>
            <Label>{p} Income</Label>
            <DollarInput T={T} value={budgetIncomes[p]||''} onChange={v => setBudgetIncomes(prev=>({...prev,[p]:v}))} placeholder="$0" />
          </>)}
        </div>
      ))}
      <div style={{ marginTop:24 }}>
        <PrimaryBtn label="Next →" disabled={budgetPeriods.length===0 || budgetPeriods.some(p=>!budgetIncomes[p])}
          onClick={() => { setBudgetViewPeriod(budgetPeriods[0]); setScreen('budget_2') }} />
      </div>
    </div>
  )

  // ── BUDGET 2 — Expense Categories + Amounts (combined) ──
  const renderBudget2 = () => {
    const balance = getBudgetBalance(budgetViewPeriod)
    const periodIdx = budgetPeriods.indexOf(budgetViewPeriod)

    if (budgetSavingsPrompt) {
      return (
        <div style={{ animation:'fadeUp 0.4s ease' }}>
          {card(<>
            <div style={{ textAlign:'center', padding:'12px 0' }}>
              <div style={{ fontSize:40, marginBottom:12 }}>💰</div>
              <SectionTitle>You have {fmtNum(balance)} remaining!</SectionTitle>
              <p style={{ color:T.t2, marginBottom:24 }}>Would you like to add it to your Savings Contributions?</p>
              <div style={{ display:'flex', gap:12, justifyContent:'center' }}>
                <PrimaryBtn label="Yes, add to savings" onClick={() => {
                  setBudgetAmounts(prev => ({
                    ...prev,
                    'Savings Contributions': {
                      ...(prev['Savings Contributions']||{}),
                      [budgetViewPeriod]: fmtDollar(String(balance))
                    }
                  }))
                  setBudgetSavingsPrompt(false)
                  setScreen('budget_4')
                }} />
                <SecBtn label="No, continue" onClick={() => { setBudgetSavingsPrompt(false); setScreen('budget_4') }} />
              </div>
            </div>
          </>)}
        </div>
      )
    }

    const handleNext = () => {
      if (balance > 0) setBudgetSavingsPrompt(true)
      else setScreen('budget_4')
    }

    return (
      <div style={{ animation:'fadeUp 0.4s ease' }}>
        <SectionTitle>Select Your Expenses</SectionTitle>
        <SubTitle>Choose all categories that apply — enter what you currently spend below</SubTitle>
        {card(<>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:20 }}>
            {EXPENSE_CATS.map(cat => (
              <Chip key={cat} label={cat} selected={budgetExpenses.includes(cat)} onToggle={() => toggleExpense(cat)} />
            ))}
          </div>
          <div style={{ borderTop:`1px solid ${T.bdr}`, paddingTop:16 }}>
            <Label>Custom Expense</Label>
            <div style={{ display:'flex', gap:10 }}>
              <input value={budgetCustom} onChange={e=>setBudgetCustom(e.target.value)}
                onKeyDown={e=>e.key==='Enter'&&addCustomExpense()}
                placeholder="e.g. Pet Care"
                style={{ flex:1, padding:'10px 14px', borderRadius:9, border:`1.5px solid ${T.bdr}`,
                  background:T.bg3, color:T.text, fontFamily:'inherit', fontSize:14, outline:'none' }} />
              <button onClick={addCustomExpense}
                style={{ padding:'10px 18px', borderRadius:9, background:T.acc2, color:'#fff',
                  border:'none', cursor:'pointer', fontFamily:'inherit', fontWeight:600 }}>Add</button>
            </div>
            {budgetExpenses.filter(c=>!EXPENSE_CATS.includes(c)).length>0 && (
              <div style={{ display:'flex', flexWrap:'wrap', gap:8, marginTop:12 }}>
                {budgetExpenses.filter(c=>!EXPENSE_CATS.includes(c)).map(c=>(
                  <span key={c} style={{ background:T.acc2, color:'#fff', borderRadius:16, padding:'4px 12px', fontSize:13 }}>
                    {c} <span onClick={()=>setBudgetExpenses(prev=>prev.filter(x=>x!==c))}
                      style={{ cursor:'pointer', marginLeft:6 }}>×</span>
                  </span>
                ))}
              </div>
            )}
          </div>
        </>)}

        {budgetExpenses.length > 0 && (
          <div style={{ marginTop:24 }}>
            <div style={{ fontWeight:700, color:T.text, fontSize:17, marginBottom:14 }}>
              Your Current Spending
            </div>
            {budgetPeriods.length > 1 && (
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:16 }}>
                <button onClick={() => setBudgetViewPeriod(budgetPeriods[Math.max(0,periodIdx-1)])}
                  disabled={periodIdx===0}
                  style={{ background:'transparent', border:`1px solid ${T.bdr}`, borderRadius:8,
                    padding:'6px 12px', cursor:periodIdx===0?'not-allowed':'pointer', opacity:periodIdx===0?0.4:1, fontSize:16 }}>←</button>
                <span style={{ color:T.acc, fontWeight:600, fontSize:16 }}>{budgetViewPeriod}</span>
                <button onClick={() => setBudgetViewPeriod(budgetPeriods[Math.min(budgetPeriods.length-1,periodIdx+1)])}
                  disabled={periodIdx===budgetPeriods.length-1}
                  style={{ background:'transparent', border:`1px solid ${T.bdr}`, borderRadius:8,
                    padding:'6px 12px', cursor:periodIdx===budgetPeriods.length-1?'not-allowed':'pointer',
                    opacity:periodIdx===budgetPeriods.length-1?0.4:1, fontSize:16 }}>→</button>
                <span style={{ color:T.t2, fontSize:13 }}>{budgetPeriods.join(' · ')}</span>
              </div>
            )}
            {budgetPeriods.length===1 && <p style={{ color:T.t2, fontSize:13, marginBottom:12 }}>Period: {budgetViewPeriod}</p>}
            {card(<>
              <div style={{ display:'grid', gap:14 }}>
                {budgetExpenses.map(cat => (
                  <div key={cat}>
                    <Label>{cat}</Label>
                    <DollarInput T={T} value={budgetAmounts[cat]?.[budgetViewPeriod]||''}
                      onChange={v => setBudgetAmounts(prev=>({...prev,[cat]:{...(prev[cat]||{}),[budgetViewPeriod]:v}}))} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop:20, padding:'14px 16px', borderRadius:10,
                background:balance<0?(dark?'#3d1a1a':'#ffe8e8'):(dark?'#0f2d1c':'#e8f5ed'),
                border:`1px solid ${balance<0?T.err:T.acc}` }}>
                <span style={{ fontWeight:700, color:balance<0?T.err:T.acc, fontSize:16 }}>
                  {balance<0?`Over Budget: ${fmtNum(Math.abs(balance))}`:`Goes to Savings: ${fmtNum(balance)}`}
                </span>
              </div>
            </>)}
          </div>
        )}

        <div style={{ marginTop:24 }}>
          <PrimaryBtn label="Next →" disabled={budgetExpenses.length===0} onClick={handleNext} />
        </div>
      </div>
    )
  }

  // ── BUDGET 4 — Budget Style ──
  const budgetStyles = [
    { id:'Lightly Conservative', desc:'Save a bit more while maintaining your current lifestyle' },
    { id:'Moderately Conservative', desc:'Cut back on non-essentials and noticeably boost savings' },
    { id:'Extremely Conservative', desc:'Maximum savings, minimal discretionary spending' },
  ]

  const renderBudget4 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Budget Style</SectionTitle>
      <SubTitle>How aggressively would you like to save?</SubTitle>
      <div style={{ display:'grid', gap:12, marginBottom:28 }}>
        {budgetStyles.map(s => (
          <RadioCard key={s.id} label={s.id} desc={s.desc} selected={budgetStyle===s.id} onSelect={() => setBudgetStyle(s.id)} />
        ))}
      </div>
      <PrimaryBtn label="Get AI Recommendation" disabled={!budgetStyle}
        onClick={() => runAI('budget_loading','budget_result', buildBudgetPrompt,'budget_4')} />
    </div>
  )

  // ── BUDGET RESULT ──
  const openBudgetPreview = () => setDlPreview({
    title: 'Budget Report (.xlsx)',
    doDownload: downloadBudgetExcel,
    preview: (
      <div>
        {budgetPeriods.map(period => {
          const expCats = budgetExpenses.filter(c => c !== 'Savings Contributions')
          return (
          <div key={period} style={{ marginBottom:20 }}>
            <div style={{ fontWeight:700, color:T.acc2, marginBottom:8, fontSize:15 }}>{period}</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:T.acc2, color:'#fff' }}>
                  <th style={{ padding:'7px 10px', textAlign:'left', fontWeight:600 }}>Category</th>
                  <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600 }}>Current</th>
                  <th style={{ padding:'7px 10px', textAlign:'right', fontWeight:600 }}>AI Recommended</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ background:T.bg3 }}>
                  <td style={{ padding:'6px 10px', color:T.text, fontWeight:600 }}>Income</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:T.acc, fontWeight:600 }}>{budgetIncomes[period]||'$0'}</td>
                  <td style={{ padding:'6px 10px', textAlign:'right', color:T.t2 }}>—</td>
                </tr>
                {expCats.map((cat,i) => (
                  <tr key={cat} style={{ background:i%2===0?T.bg2:T.bg3, borderBottom:`1px solid ${T.bdr}` }}>
                    <td style={{ padding:'5px 10px', color:T.text }}>{cat}</td>
                    <td style={{ padding:'5px 10px', textAlign:'right', color:T.text }}>{budgetAmounts[cat]?.[period]||'$0'}</td>
                    <td style={{ padding:'5px 10px', textAlign:'right', color:T.acc }}>{aiResult?.periods?.[period]?.[cat]||'$0'}</td>
                  </tr>
                ))}
                {budgetExpenses.includes('Savings Contributions') && (
                  <tr style={{ background:dark?'#0f2d1c':'#e8f5ed', borderTop:`2px solid ${T.acc}` }}>
                    <td style={{ padding:'6px 10px', color:T.acc, fontWeight:700 }}>Savings Contributions</td>
                    <td style={{ padding:'6px 10px', textAlign:'right', color:T.acc, fontWeight:700 }}>{budgetAmounts['Savings Contributions']?.[period]||'$0'}</td>
                    <td style={{ padding:'6px 10px', textAlign:'right', color:T.acc, fontWeight:700 }}>{aiResult?.periods?.[period]?.['Savings Contributions']||'$0'}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )})}

        {aiResult?.tips?.length > 0 && (
          <div style={{ marginTop:4 }}>
            <div style={{ fontWeight:700, color:T.t2, fontSize:12, marginBottom:6 }}>TIPS INCLUDED</div>
            {aiResult.tips.map((t,i) => <p key={i} style={{ color:T.t2, fontSize:12, margin:'2px 0' }}>• {t}</p>)}
          </div>
        )}
      </div>
    )
  })

  const renderBudgetResult = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Budget Recommendation</SectionTitle>
      {aiErr && <ErrorBlock onRetry={() => runAI('budget_loading','budget_result',buildBudgetPrompt,'budget_4')} />}
      {!aiErr && aiResult && <>
        {aiResult.summary && card(<p style={{ color:T.text, lineHeight:'1.6', margin:0 }}>{aiResult.summary}</p>, {marginBottom:16})}
        {aiResult.periods && budgetPeriods.map(period => (
          <div key={period} style={{ marginBottom:14 }}>
            {card(<>
              <div style={{ fontWeight:700, color:T.acc2, marginBottom:12, fontSize:15 }}>{period}</div>
              <div style={{ display:'grid', gap:6 }}>
                {budgetExpenses.filter(cat => cat !== 'Savings Contributions').map(cat => (
                  <div key={cat} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0',
                    borderBottom:`1px solid ${T.bdr}` }}>
                    <span style={{ color:T.text, fontSize:14 }}>{cat}</span>
                    <span style={{ color:T.acc, fontWeight:600, fontSize:14 }}>{aiResult.periods[period]?.[cat]||'—'}</span>
                  </div>
                ))}
                {budgetExpenses.includes('Savings Contributions') && (
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0',
                    borderTop:`2px solid ${T.acc}`, marginTop:4 }}>
                    <span style={{ color:T.acc, fontWeight:700, fontSize:14 }}>Savings Contributions</span>
                    <span style={{ color:T.acc, fontWeight:700, fontSize:14 }}>{aiResult.periods[period]?.['Savings Contributions']||'—'}</span>
                  </div>
                )}
              </div>
            </>)}
          </div>
        ))}

        {aiResult.tips?.length > 0 && card(<>
          <Label>Tips</Label>
          <ul style={{ margin:0, paddingLeft:18, color:T.text, lineHeight:'1.8' }}>
            {aiResult.tips.map((tip,i) => <li key={i}>{tip}</li>)}
          </ul>
        </>, {marginBottom:24})}
        <PrimaryBtn label="Download Excel" onClick={openBudgetPreview} />
        <SecBtn label="Start Over" onClick={() => setScreen('menu')} style={{ marginLeft:12 }} />
      </>}
    </div>
  )

  // ── CREDIT MENU ──
  const renderCreditMenu = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Credit</SectionTitle>
      <SubTitle>What would you like help with?</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <RadioCard label="Credit Cards" desc="Find the best cards for your spending habits and goals"
          icon="💳" selected={false} onSelect={() => setScreen('cc_1')} />
        <RadioCard label="Credit Score" desc="Get a personalized plan to improve your credit score"
          icon="📊" selected={false} onSelect={() => setScreen('cs_1')} />
      </div>
    </div>
  )

  // ── CC 1 — Annual Fee ──
  const renderCC1 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Annual Fee Preference</SectionTitle>
      <SubTitle>Do you want to consider cards with an annual fee?</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:28 }}>
        <RadioCard label="No Annual Fee" desc="Only show cards with $0 annual fee" selected={ccFee==='No Annual Fee'} onSelect={()=>setCcFee('No Annual Fee')} />
        <RadioCard label="Annual Fee Accepted" desc="Show all cards including premium options" selected={ccFee==='Annual Fee Accepted'} onSelect={()=>setCcFee('Annual Fee Accepted')} />
      </div>
      <PrimaryBtn label="Next →" disabled={!ccFee} onClick={()=>setScreen('cc_2')} />
    </div>
  )

  // ── CC 2 — Credit Score ──
  const scoreRanges = [
    { label:'Exceptional (800+)', color:'#22c55e' },
    { label:'Very Good (740–799)', color:'#84cc16' },
    { label:'Good (670–739)', color:'#eab308' },
    { label:'Fair (580–669)', color:'#f97316' },
    { label:'Poor (below 580)', color:'#ef4444' },
  ]

  const renderCC2 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Credit Score Range</SectionTitle>
      <SubTitle>Select the range that best describes your current score</SubTitle>
      <div style={{ display:'grid', gap:10, marginBottom:28 }}>
        {scoreRanges.map(s => (
          <div key={s.label} onClick={()=>setCcScore(s.label)}
            style={{ padding:'14px 18px', border:`2px solid ${ccScore===s.label?T.acc:T.bdr}`,
              borderRadius:10, background:ccScore===s.label?(dark?'#0f2d1c':'#e8f5ed'):T.bg2,
              cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:14,height:14,borderRadius:'50%',background:s.color,flexShrink:0 }} />
            <span style={{ fontWeight:ccScore===s.label?600:400, color:T.text }}>{s.label}</span>
          </div>
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!ccScore} onClick={()=>setScreen('cc_3')} />
    </div>
  )

  // ── CC 3 — Goals (ranked) ──
  const ccGoalOptions = ['Balance Transfer','Credit Builder','Dining Out','Groceries','Low Interest','Rewards','Student Cards','Travel']

  const toggleCCGoal = goal => {
    setCcGoals(prev => {
      if (prev.includes(goal)) return prev.filter(g=>g!==goal)
      if (prev.length >= 3) return prev
      return [...prev, goal]
    })
  }

  const renderCC3 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>What Are You Looking For?</SectionTitle>
      <SubTitle>Select up to 3 — your selections are ranked by order chosen</SubTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:28 }}>
        {ccGoalOptions.map(g => (
          <Chip key={g} label={g} selected={ccGoals.includes(g)}
            onToggle={()=>toggleCCGoal(g)}
            badge={ccGoals.includes(g)?ccGoals.indexOf(g)+1:null}
            disabled={!ccGoals.includes(g)&&ccGoals.length>=3} />
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={ccGoals.length===0} onClick={()=>setScreen('cc_4')} />
    </div>
  )

  // ── CC 4 — Income ──
  const ccIncomeOptions = ['Under $2,000','$2,000–$4,000','$4,000–$7,000','$7,000+']

  const renderCC4 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Monthly Income</SectionTitle>
      <SubTitle>What is your approximate monthly income?</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:28 }}>
        {ccIncomeOptions.map(o => (
          <RadioCard key={o} label={o} selected={ccIncome===o} onSelect={()=>setCcIncome(o)} />
        ))}
      </div>
      <PrimaryBtn label="Get Recommendations" disabled={!ccIncome}
        onClick={()=>runAI('cc_loading','cc_result',buildCCPrompt,'cc_4')} />
    </div>
  )

  // ── CREDIT CARD VISUAL ──
  const ISSUER_COLORS = {
    'Chase':             ['#003087','#0056b3'],
    'American Express':  ['#007B5E','#004d3b'],
    'Citi':              ['#003B70','#0066cc'],
    'Capital One':       ['#C41230','#8b0000'],
    'Discover':          ['#FF6200','#cc4a00'],
    'Bank of America':   ['#012169','#E31837'],
    'Wells Fargo':       ['#CC0000','#8b0000'],
    'US Bank':           ['#003087','#CC0000'],
    'Barclays':          ['#00AEEF','#005eb8'],
    'Goldman Sachs':     ['#1a3a2a','#1DB954'],
  }
  const CardVisual = ({ c }) => {
    const [c1, c2] = ISSUER_COLORS[c.issuer] || ['#1a5c3a','#1DB954']
    const net = (c.network||'').toUpperCase()
    return (
      <div style={{ width:'100%', aspectRatio:'1.586', borderRadius:14,
        background:`linear-gradient(135deg, ${c1} 0%, ${c2} 100%)`,
        padding:'18px 22px', position:'relative', overflow:'hidden',
        boxShadow:'0 8px 28px rgba(0,0,0,0.35)', color:'#fff', userSelect:'none' }}>
        {/* Decorative circles */}
        <div style={{ position:'absolute', top:-50, right:-50, width:200, height:200,
          borderRadius:'50%', background:'rgba(255,255,255,0.07)' }} />
        <div style={{ position:'absolute', bottom:-70, right:20, width:220, height:220,
          borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />
        {/* Chip */}
        <div style={{ width:42, height:32, borderRadius:5, background:'rgba(255,215,0,0.82)',
          marginBottom:18, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <div style={{ width:28, height:20, border:'1.5px solid rgba(160,110,0,0.5)',
            borderRadius:2, display:'grid', gridTemplateColumns:'1fr 1fr',
            gridTemplateRows:'1fr 1fr', gap:1, padding:3 }}>
            {[0,1,2,3].map(i=><div key={i} style={{ background:'rgba(160,110,0,0.35)', borderRadius:1 }} />)}
          </div>
        </div>
        {/* Card name */}
        <div style={{ fontWeight:700, fontSize:13, letterSpacing:'0.02em', lineHeight:1.3, marginBottom:3 }}>
          {c.name}
        </div>
        <div style={{ fontSize:11, opacity:0.72 }}>{c.issuer}</div>
        {/* Bottom row */}
        <div style={{ position:'absolute', bottom:14, left:22, right:22,
          display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
          <div style={{ fontSize:10, opacity:0.65 }}>Annual Fee: {c.annualFee||'$0'}</div>
          <div style={{ fontWeight:800, fontSize:net==='MC'?13:16, fontStyle:'italic',
            letterSpacing:net==='MASTERCARD'?'-0.01em':'0', opacity:0.92 }}>
            {net==='AMEX'?'AMEX':net==='DISCOVER'?'DISC':net==='MASTERCARD'?'Mastercard':'VISA'}
          </div>
        </div>
      </div>
    )
  }

  // ── CC RESULT ──
  const renderCCResult = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Credit Card Recommendations</SectionTitle>
      {aiErr && <ErrorBlock onRetry={()=>runAI('cc_loading','cc_result',buildCCPrompt,'cc_4')} />}
      {!aiErr && aiResult && <>
        {aiResult.summary && card(<p style={{ color:T.text, lineHeight:'1.6', margin:0 }}>{aiResult.summary}</p>, {marginBottom:16})}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:20, marginBottom:16 }}>
          {aiResult.cards?.map((card_,i) => (
            <div key={i} style={{ border:`1px solid ${T.bdr}`, borderRadius:14, overflow:'hidden', background:T.bg2 }}>
              <div style={{ padding:'14px 14px 10px' }}>
                <CardVisual c={card_} />
              </div>
              <div style={{ padding:'0 16px 16px' }}>
                <div style={{ fontWeight:700, fontSize:15, color:T.acc2, marginBottom:3 }}>{i+1}. {card_.name}</div>
                <div style={{ color:T.t2, fontSize:12, marginBottom:7 }}>
                  Score: {card_.scoreReq||'Varies'} · {card_.category||''}
                </div>
                <div style={{ color:T.text, fontSize:13, marginBottom:4 }}><strong>Key Benefit:</strong> {card_.keyBenefit}</div>
                <div style={{ color:T.t2, fontSize:12, lineHeight:'1.5' }}>{card_.why}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:8 }}>
          <PrimaryBtn label="Download PDF" onClick={()=>setDlPreview({
            title: 'Credit Card Recommendations (.pdf)',
            doDownload: downloadCCPdf,
            preview: (
              <div>
                {aiResult?.summary && <p style={{ color:T.t2, fontSize:13, marginBottom:16, lineHeight:'1.5' }}>{aiResult.summary}</p>}
                {aiResult?.cards?.map((c,i) => (
                  <div key={i} style={{ padding:'10px 14px', borderLeft:`3px solid ${T.acc}`,
                    background:T.bg3, borderRadius:6, marginBottom:8 }}>
                    <div style={{ fontWeight:700, color:T.acc2, fontSize:14 }}>{i+1}. {c.name}</div>
                    <div style={{ color:T.t2, fontSize:12 }}>{c.issuer} · {c.annualFee||'$0'} · Score: {c.scoreReq||'Varies'}</div>
                    <div style={{ color:T.text, fontSize:13, marginTop:4 }}>{c.keyBenefit}</div>
                  </div>
                ))}
              </div>
            )
          })} />
          <SecBtn label="Start Over" onClick={()=>setScreen('menu')} style={{ marginLeft:12 }} />
        </div>
        <p style={{ color:T.t2, fontSize:12, marginTop:16 }}>{DISCLAIMER}</p>
      </>}
    </div>
  )

  // ── CS 1 — Gate ──
  const renderCS1 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Credit Score Improvement</SectionTitle>
      <SubTitle>Do you want to improve your credit score?</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:28 }}>
        <RadioCard label="Yes" desc="Get a personalized improvement plan" selected={false} onSelect={()=>setScreen('cs_2')} />
        <RadioCard label="No" desc="Return to the credit menu" selected={false} onSelect={()=>setScreen('credit_menu')} />
      </div>
    </div>
  )

  // ── CS 2 — Goals ──
  const csGoalOptions = ['Build financial health','Buy a car','Buy a house','Lower my interest rates','Qualify for a loan']

  const renderCS2 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Why do you want to raise your credit?</SectionTitle>
      <SubTitle>Select all that apply</SubTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16 }}>
        {csGoalOptions.map(g => (
          <Chip key={g} label={g} selected={csGoals.includes(g)}
            onToggle={()=>setCsGoals(prev=>prev.includes(g)?prev.filter(x=>x!==g):[...prev,g])} />
        ))}
      </div>
      <div style={{ marginBottom:24 }}>
        <Label>Other</Label>
        <input value={csGoalOther} onChange={e=>setCsGoalOther(e.target.value)} placeholder="Describe your goal..."
          style={{ padding:'10px 14px', borderRadius:9, border:`1.5px solid ${T.bdr}`, background:T.bg3,
            color:T.text, fontFamily:'inherit', fontSize:14, width:'100%', outline:'none' }} />
      </div>
      <PrimaryBtn label="Next →" disabled={csGoals.length===0&&!csGoalOther}
        onClick={()=>setScreen('cs_3')} />
    </div>
  )

  // ── CS 3 — Score Range ──
  const renderCS3 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Current Credit Score Range</SectionTitle>
      <SubTitle>Select the range that best describes your current score</SubTitle>
      <div style={{ display:'grid', gap:10, marginBottom:28 }}>
        {scoreRanges.map(s => (
          <div key={s.label} onClick={()=>setCsScore(s.label)}
            style={{ padding:'14px 18px', border:`2px solid ${csScore===s.label?T.acc:T.bdr}`,
              borderRadius:10, background:csScore===s.label?(dark?'#0f2d1c':'#e8f5ed'):T.bg2,
              cursor:'pointer', display:'flex', alignItems:'center', gap:12 }}>
            <div style={{ width:14,height:14,borderRadius:'50%',background:s.color,flexShrink:0 }} />
            <span style={{ fontWeight:csScore===s.label?600:400, color:T.text }}>{s.label}</span>
          </div>
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!csScore} onClick={()=>setScreen('cs_4')} />
    </div>
  )

  // ── CS 4 — Struggles ──
  const csStruggleOptions = ['Collections or charge-offs','High credit card balances','Limited credit history','Maxed out cards','Paying bills on time']

  const toggleStruggle = s => {
    setCsStruggles(prev => {
      if (prev.includes(s)) return prev.filter(x=>x!==s)
      if (prev.length >= 2) return prev
      return [...prev,s]
    })
  }

  const renderCS4 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>What do you struggle with?</SectionTitle>
      <SubTitle>Select up to 2</SubTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16 }}>
        {csStruggleOptions.map(s => (
          <Chip key={s} label={s} selected={csStruggles.includes(s)} onToggle={()=>toggleStruggle(s)}
            disabled={!csStruggles.includes(s)&&csStruggles.length>=2} />
        ))}
      </div>
      <div style={{ marginBottom:24 }}>
        <Label>Other</Label>
        <input value={csStruggleOther} onChange={e=>setCsStruggleOther(e.target.value)} placeholder="Describe your struggle..."
          style={{ padding:'10px 14px', borderRadius:9, border:`1.5px solid ${T.bdr}`, background:T.bg3,
            color:T.text, fontFamily:'inherit', fontSize:14, width:'100%', outline:'none' }} />
      </div>
      <PrimaryBtn label="Next →" disabled={csStruggles.length===0&&!csStruggleOther}
        onClick={()=>setScreen('cs_5')} />
    </div>
  )

  // ── CS 5 — Behavior Questions ──
  const renderCS5 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>A Few More Questions</SectionTitle>
      <SubTitle>Help us understand your credit behavior</SubTitle>
      <div style={{ display:'grid', gap:20 }}>
        {card(<>
          <Label>How many credit cards do you currently have?</Label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
            {['0','1–2','3–5','6+'].map(o=>(
              <Chip key={o} label={o} selected={csCards===o} onToggle={()=>setCsCards(o)} />
            ))}
          </div>
        </>)}
        {card(<>
          <Label>Do you pay at least the minimum payment each month?</Label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
            {['Always','Sometimes','Never'].map(o=>(
              <Chip key={o} label={o} selected={csPayment===o} onToggle={()=>setCsPayment(o)} />
            ))}
          </div>
        </>)}
        {card(<>
          <Label>How old is your oldest account?</Label>
          <div style={{ display:'flex', flexWrap:'wrap', gap:10 }}>
            {['Less than 1 year','1–3 years','3–7 years','7+ years'].map(o=>(
              <Chip key={o} label={o} selected={csOldest===o} onToggle={()=>setCsOldest(o)} />
            ))}
          </div>
        </>)}
      </div>
      <div style={{ marginTop:24 }}>
        <PrimaryBtn label="Get My Plan" disabled={!csCards||!csPayment||!csOldest}
          onClick={()=>runAI('cs_loading','cs_result',buildCSPrompt,'cs_5')} />
      </div>
    </div>
  )

  // ── CS RESULT ──
  const renderCSResult = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Credit Score Improvement Plan</SectionTitle>
      {aiErr && <ErrorBlock onRetry={()=>runAI('cs_loading','cs_result',buildCSPrompt,'cs_5')} />}
      {!aiErr && aiResult && <>
        {aiResult.summary && card(<p style={{ color:T.text, lineHeight:'1.6', margin:0 }}>{aiResult.summary}</p>, {marginBottom:16})}
        {[
          { title:'Immediate Actions (Next 30 Days)', items:aiResult.immediateActions, bg:dark?'#2a2000':'#fffbe6' },
          { title:'Short-Term Actions (1–6 Months)', items:aiResult.shortTermActions, bg:dark?'#0f2d1c':'#e8f5ed' },
          { title:'Long-Term Strategy (6–24 Months)', items:aiResult.longTermStrategy, bg:dark?'#001a2e':'#e6f2ff' },
          { title:'Tips for Your Struggles', items:aiResult.struggleTips, bg:T.bg3 },
        ].filter(s=>s.items?.length).map((sec,i) => (
          <div key={i} style={{ marginBottom:14 }}>
            {card(<>
              <div style={{ fontWeight:700, color:T.acc2, marginBottom:10 }}>{sec.title}</div>
              <ul style={{ margin:0, paddingLeft:18, color:T.text, lineHeight:'1.8' }}>
                {sec.items.map((item,j) => <li key={j}>{item}</li>)}
              </ul>
            </>, {background:sec.bg})}
          </div>
        ))}
        {aiResult.timeline && card(<>
          <Label>Expected Timeline</Label>
          <p style={{ color:T.text, margin:0, lineHeight:'1.6' }}>{aiResult.timeline}</p>
        </>, {marginBottom:16})}
        {aiResult.urls?.length > 0 && card(<>
          <Label>Further Reading</Label>
          <ul style={{ margin:0, paddingLeft:18, lineHeight:'1.9' }}>
            {aiResult.urls.map((u,i)=>(
              <li key={i}><a href={u.url} target="_blank" rel="noopener noreferrer"
                style={{ color:T.acc }}>{u.source}</a> — {u.why}</li>
            ))}
          </ul>
        </>, {marginBottom:12})}
        {aiResult.sources?.length > 0 && (
          <p style={{ color:T.t2, fontSize:12 }}>Sources: {aiResult.sources.join(' · ')}</p>
        )}
        <div style={{ marginTop:8 }}>
          <PrimaryBtn label="Download PDF" onClick={()=>setDlPreview({
            title: 'Credit Score Improvement Plan (.pdf)',
            doDownload: downloadCSPdf,
            preview: (
              <div>
                {aiResult?.summary && <p style={{ color:T.t2, fontSize:13, marginBottom:14, lineHeight:'1.5' }}>{aiResult.summary}</p>}
                {[
                  { label:'Immediate Actions', items:aiResult?.immediateActions },
                  { label:'Short-Term Actions', items:aiResult?.shortTermActions },
                  { label:'Long-Term Strategy', items:aiResult?.longTermStrategy },
                ].filter(s=>s.items?.length).map((sec,i) => (
                  <div key={i} style={{ marginBottom:10 }}>
                    <div style={{ fontWeight:700, color:T.acc2, fontSize:13, marginBottom:4 }}>{sec.label}</div>
                    {sec.items.slice(0,2).map((item,j) => (
                      <p key={j} style={{ color:T.text, fontSize:12, margin:'2px 0' }}>• {item}</p>
                    ))}
                    {sec.items.length>2 && <p style={{ color:T.t2, fontSize:11, margin:'2px 0' }}>+{sec.items.length-2} more…</p>}
                  </div>
                ))}
                {aiResult?.sources?.length > 0 && (
                  <p style={{ color:T.t2, fontSize:11, marginTop:10 }}>Sources: {aiResult.sources.join(' · ')}</p>
                )}
              </div>
            )
          })} />
          <SecBtn label="Start Over" onClick={()=>setScreen('menu')} style={{ marginLeft:12 }} />
        </div>
        <p style={{ color:T.t2, fontSize:12, marginTop:16 }}>{DISCLAIMER}</p>
      </>}
    </div>
  )

  // ── BANK 1 ──
  const bankTypes = [
    { id:'CDs', icon:'🏛️', desc:'Certificates of Deposit — fixed-rate, time-locked' },
    { id:'Checking', icon:'✔️', desc:'Everyday spending and bill pay' },
    { id:'Money Market Account', icon:'💵', desc:'Higher APY with some check-writing privileges' },
    { id:'Savings', icon:'🐷', desc:'High-yield savings accounts' },
  ]

  const renderBank1 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>What are you looking for?</SectionTitle>
      <SubTitle>Select the account type you want to open</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:28 }}>
        {bankTypes.map(t => (
          <RadioCard key={t.id} label={t.id} desc={t.desc} icon={t.icon} selected={bankLooking===t.id} onSelect={()=>setBankLooking(t.id)} />
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!bankLooking} onClick={()=>setScreen('bank_2')} />
    </div>
  )

  // ── BANK 2 ──
  const bankOptions = ['Bank of America','Chase','Other','US Bank','Wells Fargo']

  const renderBank2 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Current Bank</SectionTitle>
      <SubTitle>Who do you currently bank with?</SubTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:28 }}>
        {bankOptions.map(b => (
          <Chip key={b} label={b} selected={bankCurrent===b} onToggle={()=>setBankCurrent(b)} />
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!bankCurrent} onClick={()=>setScreen('bank_3')} />
    </div>
  )

  // ── BANK 3 ──
  const renderBank3 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Banking Preference</SectionTitle>
      <SubTitle>Do you prefer in-person or online banking?</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:28 }}>
        {[
          { id:'Brick and Mortar', icon:'🏢', desc:'Physical branches nearby' },
          { id:'Online Banking', icon:'💻', desc:'100% digital, typically higher APY' },
          { id:'No Preference', icon:'🔄', desc:'Open to either option' },
        ].map(o => (
          <RadioCard key={o.id} label={o.id} desc={o.desc} icon={o.icon} selected={bankPref===o.id} onSelect={()=>setBankPref(o.id)} />
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!bankPref} onClick={()=>setScreen('bank_4')} />
    </div>
  )

  // ── BANK 4 ──
  const bankPriorityOptions = ['ATM Access','Customer Service','High APY','Mobile App','No Fees']

  const toggleBankPriority = p => {
    setBankPriorities(prev => {
      if (prev.includes(p)) return prev.filter(x=>x!==p)
      if (prev.length >= 2) return prev
      return [...prev,p]
    })
  }

  const renderBank4 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Priorities</SectionTitle>
      <SubTitle>Select up to 2</SubTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:28 }}>
        {bankPriorityOptions.map(p => (
          <Chip key={p} label={p} selected={bankPriorities.includes(p)} onToggle={()=>toggleBankPriority(p)}
            disabled={!bankPriorities.includes(p)&&bankPriorities.length>=2} />
        ))}
      </div>
      <PrimaryBtn label="Get Recommendations" disabled={bankPriorities.length===0}
        onClick={()=>runAI('bank_loading','bank_result',buildBankPrompt,'bank_4')} />
    </div>
  )

  // ── BANK RESULT ──
  const renderBankResult = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Banking Recommendations</SectionTitle>
      {aiErr && <ErrorBlock onRetry={()=>runAI('bank_loading','bank_result',buildBankPrompt,'bank_4')} />}
      {!aiErr && aiResult && <>
        {aiResult.summary && card(<p style={{ color:T.text, lineHeight:'1.6', margin:0 }}>{aiResult.summary}</p>, {marginBottom:16})}
        {aiResult.recommendations?.map((rec,i) => (
          <div key={i} style={{ borderTop:`1px solid ${T.bdr}`, borderRight:`1px solid ${T.bdr}`,
            borderBottom:`1px solid ${T.bdr}`, borderLeft:`4px solid ${T.acc}`,
            borderRadius:12, padding:'16px 20px', marginBottom:12, background:T.bg2 }}>
            <div style={{ fontWeight:700, fontSize:16, color:T.acc2, marginBottom:4 }}>#{rec.rank} — {rec.name}</div>
            <div style={{ color:T.t2, fontSize:13, marginBottom:6 }}>
              APY: {rec.apy||'N/A'} · Fees: {rec.fees||'N/A'} · {rec.format||''}
            </div>
            <div style={{ color:T.text, fontSize:14, marginBottom:2 }}>{rec.keyFeature}</div>
            <div style={{ color:T.t2, fontSize:13 }}>{rec.why}</div>
          </div>
        ))}
        <div style={{ marginTop:8 }}>
          <PrimaryBtn label="Download PDF" onClick={()=>setDlPreview({
            title: 'Banking Recommendations (.pdf)',
            doDownload: downloadBankPdf,
            preview: (
              <div>
                {aiResult?.summary && <p style={{ color:T.t2, fontSize:13, marginBottom:14, lineHeight:'1.5' }}>{aiResult.summary}</p>}
                {aiResult?.recommendations?.map((rec,i) => (
                  <div key={i} style={{ padding:'10px 14px', borderLeft:`3px solid ${T.acc}`,
                    background:T.bg3, borderRadius:6, marginBottom:8 }}>
                    <div style={{ fontWeight:700, color:T.acc2, fontSize:14 }}>#{rec.rank} — {rec.name}</div>
                    <div style={{ color:T.t2, fontSize:12 }}>APY: {rec.apy||'N/A'} · Fees: {rec.fees||'N/A'}</div>
                    <div style={{ color:T.text, fontSize:13, marginTop:3 }}>{rec.keyFeature}</div>
                  </div>
                ))}
              </div>
            )
          })} />
          <SecBtn label="Start Over" onClick={()=>setScreen('menu')} style={{ marginLeft:12 }} />
        </div>
        <p style={{ color:T.t2, fontSize:12, marginTop:16 }}>{DISCLAIMER}</p>
      </>}
    </div>
  )

  // ── FINANCE 1 ──
  const financeTypes = [
    { id:'Business Loan', icon:'💼' }, { id:'Car', icon:'🚗' }, { id:'House', icon:'🏠' },
    { id:'Personal Loan', icon:'👤' }, { id:'Student Loan', icon:'🎓' },
  ]

  const renderFinance1 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>What are you looking to finance?</SectionTitle>
      <SubTitle>Select the type of loan</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:12, marginBottom:28 }}>
        {financeTypes.map(t => (
          <RadioCard key={t.id} label={t.id} icon={t.icon} selected={financeType===t.id} onSelect={()=>setFinanceType(t.id)} />
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!financeType} onClick={()=>setScreen('finance_2')} />
    </div>
  )

  // ── FINANCE 2 ──
  const renderFinance2 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Loan Details</SectionTitle>
      <SubTitle>Enter your {financeType.toLowerCase()} loan information</SubTitle>
      {card(<div style={{ display:'grid', gap:18 }}>
        <div>
          <Label>Down Payment</Label>
          <DollarInput T={T} value={downPayment} onChange={setDownPayment} placeholder="$0" />
        </div>
        <div>
          <Label>Loan Amount</Label>
          <DollarInput T={T} value={loanAmount} onChange={setLoanAmount} placeholder="$200,000" />
        </div>
        <div>
          <Label>Loan Term (Years)</Label>
          <input type="number" min="1" max="50" value={loanTerm}
            onChange={e=>setLoanTerm(e.target.value)} placeholder="30"
            style={{ padding:'11px 14px', borderRadius:9, border:`1.5px solid ${T.bdr}`, background:T.bg3,
              color:T.text, fontFamily:'inherit', fontSize:15, width:'90px', outline:'none' }} />
        </div>
        <div>
          <Label>Interest Rate (%)</Label>
          <input type="number" step="0.1" min="0" max="30" value={interestRate}
            onChange={e=>setInterestRate(e.target.value)} placeholder="6.5"
            style={{ padding:'11px 14px', borderRadius:9, border:`1.5px solid ${T.bdr}`, background:T.bg3,
              color:T.text, fontFamily:'inherit', fontSize:15, width:'100%', outline:'none' }} />
        </div>
      </div>)}
      <div style={{ marginTop:24 }}>
        <PrimaryBtn label="Calculate" disabled={!loanAmount||!interestRate||!loanTerm}
          onClick={()=>setScreen('finance_result')} />
      </div>
    </div>
  )

  // ── FINANCE RESULT ──
  const renderFinanceResult = () => {
    const p = Math.max(0, parseDollar(loanAmount) - parseDollar(downPayment))
    const r = parseFloat(interestRate)||0
    const t = parseInt(loanTerm)||0
    const { payment, yearly } = calcAmortization(p,r,t)
    const totalInterest = yearly.reduce((s,row)=>s+row.interestPaid,0)
    const totalPaid = p + totalInterest
    const payoffYear = new Date().getFullYear() + t

    const summaryCards = [
      { label:'Monthly Payment', value:fmtNum(payment) },
      { label:'Total Interest', value:fmtNum(totalInterest) },
      { label:'Total Paid', value:fmtNum(totalPaid) },
      { label:'Payoff Year', value:payoffYear },
    ]

    return (
      <div style={{ animation:'fadeUp 0.4s ease' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <SectionTitle>Amortization Calculator</SectionTitle>
          <button onClick={downloadFinancePdf}
            style={{ background:T.acc, color:'#fff', border:'none', borderRadius:8,
              padding:'8px 18px', cursor:'pointer', fontFamily:'inherit', fontWeight:600, fontSize:14 }}>
            Download PDF
          </button>
        </div>

        {/* Chart */}
        {card(<div style={{ height:260 }}>
          <canvas ref={chartRef} style={{ width:'100%', height:'100%' }} />
        </div>, {marginBottom:16})}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          {/* Left — Inputs + Summary */}
          <div>
            {card(<>
              <Label>Down Payment</Label>
              <DollarInput T={T} value={downPayment} onChange={setDownPayment} placeholder="$0" />
              <div style={{ marginTop:14 }}>
                <Label>Loan Amount</Label>
                <DollarInput T={T} value={loanAmount} onChange={setLoanAmount} />
              </div>
              <div style={{ marginTop:14 }}>
                <Label>Loan Term (Years)</Label>
                <input type="number" min="1" max="50" value={loanTerm}
                  onChange={e=>setLoanTerm(e.target.value)} placeholder="30"
                  style={{ padding:'9px 12px', borderRadius:8, border:`1.5px solid ${T.bdr}`,
                    background:T.bg3, color:T.text, fontFamily:'inherit', fontSize:14, width:'90px', outline:'none' }} />
              </div>
              <div style={{ marginTop:14 }}>
                <Label>Interest Rate (%)</Label>
                <input type="number" step="0.1" min="0" max="30" value={interestRate}
                  onChange={e=>setInterestRate(e.target.value)}
                  style={{ padding:'9px 12px', borderRadius:8, border:`1.5px solid ${T.bdr}`,
                    background:T.bg3, color:T.text, fontFamily:'inherit', fontSize:14, width:'90px', outline:'none' }} />
              </div>
            </>)}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:12 }}>
              {summaryCards.map(sc => (
                <div key={sc.label} style={{ background:T.bg2, border:`1px solid ${T.bdr}`, borderRadius:10,
                  padding:'12px 14px', textAlign:'center' }}>
                  <div style={{ color:T.t2, fontSize:11, marginBottom:4 }}>{sc.label}</div>
                  <div style={{ color:T.acc, fontWeight:700, fontSize:16 }}>{sc.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Right — Amortization Table */}
          <div style={{ background:T.bg2, border:`1px solid ${T.bdr}`, borderRadius:12,
            maxHeight:400, overflowY:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead style={{ position:'sticky', top:0, background:T.acc2 }}>
                <tr>
                  {['Year','Principal','Interest','Balance'].map(h=>(
                    <th key={h} style={{ padding:'10px 8px', color:'#fff', fontWeight:600, textAlign:'right',
                      ...(h==='Year'?{textAlign:'left'}:{}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {yearly.map((row,i) => (
                  <tr key={row.year} style={{ background:i%2===0?T.bg2:T.bg3 }}>
                    <td style={{ padding:'8px', color:T.text }}>{row.year}</td>
                    <td style={{ padding:'8px', color:T.text, textAlign:'right' }}>{fmtNum(row.principalPaid)}</td>
                    <td style={{ padding:'8px', color:T.t2, textAlign:'right' }}>{fmtNum(row.interestPaid)}</td>
                    <td style={{ padding:'8px', color:T.acc, textAlign:'right', fontWeight:600 }}>{fmtNum(row.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <p style={{ color:T.t2, fontSize:12, marginTop:16 }}>{DISCLAIMER}</p>
      </div>
    )
  }

  // ── INVEST 1 ──
  const renderInvest1 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Investment Horizon</SectionTitle>
      <SubTitle>What type of investing are you looking to do?</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:28 }}>
        <RadioCard label="Short-Term" desc="Less than 5 years — emergency funds, down payments, near-term goals"
          icon="⏱️" selected={investType==='short'} onSelect={()=>setInvestType('short')} />
        <RadioCard label="Long-Term" desc="5+ years — retirement, wealth building, long-horizon goals"
          icon="📅" selected={investType==='long'} onSelect={()=>setInvestType('long')} />
      </div>
      <PrimaryBtn label="Next →" disabled={!investType}
        onClick={()=>setScreen(investType==='short'?'invest_s2':'invest_l2')} />
    </div>
  )

  // ── INVEST SHORT 2 — Goal ──
  const shortGoals = ['Down Payment','Dividend Income','Emergency Fund','Security Cushion']

  const renderInvestS2 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>What is your goal?</SectionTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16 }}>
        {shortGoals.map(g=>(
          <Chip key={g} label={g} selected={investGoal===g} onToggle={()=>setInvestGoal(g)} />
        ))}
      </div>
      <div style={{ marginBottom:24 }}>
        <Label>Other</Label>
        <input value={investGoalOther} onChange={e=>setInvestGoalOther(e.target.value)} placeholder="Describe your goal..."
          style={{ padding:'10px 14px', borderRadius:9, border:`1.5px solid ${T.bdr}`, background:T.bg3,
            color:T.text, fontFamily:'inherit', fontSize:14, width:'100%', outline:'none' }} />
      </div>
      <PrimaryBtn label="Next →" disabled={!investGoal&&!investGoalOther} onClick={()=>setScreen('invest_s3')} />
    </div>
  )

  // ── INVEST SHORT 3 — Timeline ──
  const renderInvestS3 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Timeline</SectionTitle>
      <SubTitle>How long until you need this money?</SubTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:28 }}>
        {['Less than 1 year','1–3 years','3–5 years'].map(t=>(
          <Chip key={t} label={t} selected={investTimeline===t} onToggle={()=>setInvestTimeline(t)} />
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!investTimeline} onClick={()=>setScreen('invest_s4')} />
    </div>
  )

  // ── INVEST SHORT 4/5 — Starting Amount / Monthly ──
  const renderInvestS4 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Starting Amount</SectionTitle>
      <SubTitle>How much do you have to invest today?</SubTitle>
      {card(<DollarInput T={T} value={investStart} onChange={setInvestStart} placeholder="$5,000" />)}
      <div style={{ marginTop:24 }}>
        <PrimaryBtn label="Next →" disabled={!investStart} onClick={()=>setScreen('invest_s5')} />
      </div>
    </div>
  )

  const renderInvestS5 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Monthly Contribution</SectionTitle>
      <SubTitle>How much can you contribute each month?</SubTitle>
      {card(<DollarInput T={T} value={investMonthly} onChange={setInvestMonthly} placeholder="$200" />)}
      <div style={{ marginTop:24 }}>
        <PrimaryBtn label="Next →" disabled={!investMonthly} onClick={()=>setScreen('invest_s6')} />
      </div>
    </div>
  )

  // ── INVEST SHORT 6 — Risk ──
  const riskOptions = [
    { id:'Low (preserve capital)', desc:'Prioritize keeping your money safe, minimal growth' },
    { id:'Medium (some growth ok)', desc:'Balanced — willing to accept some fluctuation for better returns' },
    { id:'High (willing to risk loss)', desc:'Maximize growth potential, comfortable with volatility' },
  ]

  const renderInvestS6 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Risk Tolerance</SectionTitle>
      <div style={{ display:'grid', gap:12, marginBottom:28 }}>
        {riskOptions.map(o=>(
          <RadioCard key={o.id} label={o.id} desc={o.desc} selected={investRisk===o.id} onSelect={()=>setInvestRisk(o.id)} />
        ))}
      </div>
      <PrimaryBtn label="Get My Plan" disabled={!investRisk}
        onClick={()=>runAI('invest_loading','invest_result',buildInvestPrompt,'invest_s6')} />
    </div>
  )

  // ── INVEST LONG 2 — Goal ──
  const longGoals = ['Debt Leveraging','Retirement','Wealth Building']

  const renderInvestL2 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>What is your long-term goal?</SectionTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:16 }}>
        {longGoals.map(g=>(
          <Chip key={g} label={g} selected={investGoal===g} onToggle={()=>setInvestGoal(g)} />
        ))}
      </div>
      <div style={{ marginBottom:24 }}>
        <Label>Other</Label>
        <input value={investGoalOther} onChange={e=>setInvestGoalOther(e.target.value)} placeholder="Describe your goal..."
          style={{ padding:'10px 14px', borderRadius:9, border:`1.5px solid ${T.bdr}`, background:T.bg3,
            color:T.text, fontFamily:'inherit', fontSize:14, width:'100%', outline:'none' }} />
      </div>
      <PrimaryBtn label="Next →" disabled={!investGoal&&!investGoalOther} onClick={()=>setScreen('invest_l3')} />
    </div>
  )

  // ── INVEST LONG 3 — Timeline ──
  const renderInvestL3 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Investment Timeline</SectionTitle>
      <div style={{ display:'flex', flexWrap:'wrap', gap:10, marginBottom:28 }}>
        {['5–10 years','10–20 years','20–30 years','30+ years'].map(t=>(
          <Chip key={t} label={t} selected={investTimeline===t} onToggle={()=>setInvestTimeline(t)} />
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!investTimeline} onClick={()=>setScreen('invest_l4')} />
    </div>
  )

  // ── INVEST LONG 4/5 ──
  const renderInvestL4 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Starting Amount</SectionTitle>
      <SubTitle>How much do you have to invest today?</SubTitle>
      {card(<DollarInput T={T} value={investStart} onChange={setInvestStart} placeholder="$10,000" />)}
      <div style={{ marginTop:24 }}>
        <PrimaryBtn label="Next →" disabled={!investStart} onClick={()=>setScreen('invest_l5')} />
      </div>
    </div>
  )

  const renderInvestL5 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Monthly Contribution</SectionTitle>
      <SubTitle>How much can you contribute each month?</SubTitle>
      {card(<DollarInput T={T} value={investMonthly} onChange={setInvestMonthly} placeholder="$500" />)}
      <div style={{ marginTop:24 }}>
        <PrimaryBtn label="Next →" disabled={!investMonthly} onClick={()=>setScreen('invest_l6')} />
      </div>
    </div>
  )

  // ── INVEST LONG 6 — Risk ──
  const renderInvestL6 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Risk Tolerance</SectionTitle>
      <div style={{ display:'grid', gap:12, marginBottom:28 }}>
        {riskOptions.map(o=>(
          <RadioCard key={o.id} label={o.id} desc={o.desc} selected={investRisk===o.id} onSelect={()=>setInvestRisk(o.id)} />
        ))}
      </div>
      <PrimaryBtn label="Next →" disabled={!investRisk} onClick={()=>setScreen('invest_l7')} />
    </div>
  )

  // ── INVEST LONG 7 — 401k/IRA ──
  const renderInvestL7 = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Retirement Accounts</SectionTitle>
      <SubTitle>Do you currently have a 401(k) or IRA?</SubTitle>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:28 }}>
        {[
          { id:'Yes', icon:'✅', desc:'I actively contribute' },
          { id:'No', icon:'❌', desc:"I don't have one yet" },
          { id:'Not sure', icon:'🤔', desc:"I'm not certain" },
        ].map(o=>(
          <RadioCard key={o.id} label={o.id} desc={o.desc} icon={o.icon} selected={investHas401k===o.id} onSelect={()=>setInvestHas401k(o.id)} />
        ))}
      </div>
      <PrimaryBtn label="Get My Plan" disabled={!investHas401k}
        onClick={()=>runAI('invest_loading','invest_result',buildInvestPrompt,'invest_l7')} />
    </div>
  )

  // ── INVEST RESULT ──
  const renderInvestResult = () => (
    <div style={{ animation:'fadeUp 0.4s ease' }}>
      <SectionTitle>Your Investment Plan</SectionTitle>
      {aiErr && <ErrorBlock onRetry={()=>runAI('invest_loading','invest_result',buildInvestPrompt,'invest_s6')} />}
      {!aiErr && aiResult && <>
        {aiResult.summary && card(<p style={{ color:T.text, lineHeight:'1.6', margin:0 }}>{aiResult.summary}</p>, {marginBottom:16})}
        {aiResult.investments?.map((inv,i) => (
          <div key={i} style={{ borderTop:`1px solid ${T.bdr}`, borderRight:`1px solid ${T.bdr}`,
            borderBottom:`1px solid ${T.bdr}`, borderLeft:`4px solid ${T.acc}`,
            borderRadius:12, padding:'18px 20px', marginBottom:12, background:T.bg2 }}>
            <div style={{ fontWeight:700, fontSize:16, color:T.acc2, marginBottom:4 }}>
              {i+1}. {inv.name}{inv.exampleTicker?` (${inv.exampleTicker})`:''}
            </div>
            <p style={{ color:T.t2, fontSize:13, margin:'0 0 6px' }}>{inv.whatItIs}</p>
            <p style={{ color:T.text, fontSize:14, margin:'0 0 4px' }}><strong>Why it fits:</strong> {inv.whyItFits}</p>
            <p style={{ color:T.text, fontSize:14, margin:0 }}><strong>Goal connection:</strong> {inv.howItTiesIn}</p>
          </div>
        ))}
        {aiResult.urls?.length > 0 && card(<>
          <Label>Further Reading</Label>
          <ul style={{ margin:0, paddingLeft:18, lineHeight:'1.9' }}>
            {aiResult.urls.map((u,i)=>(
              <li key={i}><a href={u.url} target="_blank" rel="noopener noreferrer"
                style={{ color:T.acc }}>{u.source}</a> — {u.why}</li>
            ))}
          </ul>
        </>, {marginBottom:12})}
        {aiResult.sources?.length > 0 && (
          <p style={{ color:T.t2, fontSize:12 }}>Sources: {aiResult.sources.join(' · ')}</p>
        )}
        <div style={{ marginTop:8 }}>
          <PrimaryBtn label="Download PDF" onClick={()=>setDlPreview({
            title: 'Investment Recommendations (.pdf)',
            doDownload: downloadInvestPdf,
            preview: (
              <div>
                {aiResult?.summary && <p style={{ color:T.t2, fontSize:13, marginBottom:14, lineHeight:'1.5' }}>{aiResult.summary}</p>}
                {aiResult?.investments?.map((inv,i) => (
                  <div key={i} style={{ padding:'10px 14px', borderLeft:`3px solid ${T.acc}`,
                    background:T.bg3, borderRadius:6, marginBottom:8 }}>
                    <div style={{ fontWeight:700, color:T.acc2, fontSize:14 }}>
                      {i+1}. {inv.name}{inv.exampleTicker?` (${inv.exampleTicker})`:''}
                    </div>
                    <div style={{ color:T.t2, fontSize:12, marginTop:2 }}>{inv.whatItIs}</div>
                  </div>
                ))}
                {aiResult?.sources?.length > 0 && (
                  <p style={{ color:T.t2, fontSize:11, marginTop:10 }}>Sources: {aiResult.sources.join(' · ')}</p>
                )}
              </div>
            )
          })} />
          <SecBtn label="Start Over" onClick={()=>setScreen('menu')} style={{ marginLeft:12 }} />
        </div>
        <p style={{ color:T.t2, fontSize:12, marginTop:16 }}>{DISCLAIMER}</p>
      </>}
    </div>
  )

  // ══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════
  return (
    <div style={{ background:T.bg, minHeight:'100vh', color:T.text, fontFamily:"'Sora', system-ui, sans-serif" }}>
      <PreviewModal />
      <NavBar />
      <div style={{ maxWidth:820, margin:'0 auto', padding:'36px 20px 60px' }}>
        {screen==='gate'           && renderGate()}
        {screen==='menu'           && renderMenu()}

        {screen==='budget_1'       && renderBudget1()}
        {screen==='budget_2'       && renderBudget2()}
        {screen==='budget_4'       && renderBudget4()}
        {screen==='budget_loading' && <LoadingScreen backScreen='budget_4' />}
        {screen==='budget_result'  && renderBudgetResult()}

        {screen==='credit_menu'    && renderCreditMenu()}
        {screen==='cc_1'           && renderCC1()}
        {screen==='cc_2'           && renderCC2()}
        {screen==='cc_3'           && renderCC3()}
        {screen==='cc_4'           && renderCC4()}
        {screen==='cc_loading'     && <LoadingScreen backScreen='cc_4' />}
        {screen==='cc_result'      && renderCCResult()}

        {screen==='cs_1'           && renderCS1()}
        {screen==='cs_2'           && renderCS2()}
        {screen==='cs_3'           && renderCS3()}
        {screen==='cs_4'           && renderCS4()}
        {screen==='cs_5'           && renderCS5()}
        {screen==='cs_loading'     && <LoadingScreen backScreen='cs_5' />}
        {screen==='cs_result'      && renderCSResult()}

        {screen==='bank_1'         && renderBank1()}
        {screen==='bank_2'         && renderBank2()}
        {screen==='bank_3'         && renderBank3()}
        {screen==='bank_4'         && renderBank4()}
        {screen==='bank_loading'   && <LoadingScreen backScreen='bank_4' />}
        {screen==='bank_result'    && renderBankResult()}

        {screen==='finance_1'      && renderFinance1()}
        {screen==='finance_2'      && renderFinance2()}
        {screen==='finance_result' && renderFinanceResult()}

        {screen==='invest_1'       && renderInvest1()}
        {screen==='invest_s2'      && renderInvestS2()}
        {screen==='invest_s3'      && renderInvestS3()}
        {screen==='invest_s4'      && renderInvestS4()}
        {screen==='invest_s5'      && renderInvestS5()}
        {screen==='invest_s6'      && renderInvestS6()}
        {screen==='invest_l2'      && renderInvestL2()}
        {screen==='invest_l3'      && renderInvestL3()}
        {screen==='invest_l4'      && renderInvestL4()}
        {screen==='invest_l5'      && renderInvestL5()}
        {screen==='invest_l6'      && renderInvestL6()}
        {screen==='invest_l7'      && renderInvestL7()}
        {screen==='invest_loading' && <LoadingScreen backScreen='invest_s6' />}
        {screen==='invest_result'  && renderInvestResult()}
      </div>
    </div>
  )
}
