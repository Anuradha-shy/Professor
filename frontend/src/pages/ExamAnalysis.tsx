import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, StatCard } from "@/components/kit";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "@/lib/recharts";
import { useSessions, useTests } from "@/lib/queries";
import mainsTrendRaw from "@/data/mains_gs_trend_2013_2026.json?raw";
import subjectWeightsRaw from "@/data/subject_weightage_v861.json?raw";
import researchFindingsRaw from "@/data/research_findings_post_2026_v3.json?raw";
import pyqYearSummaryRaw from "@/data/pyq_2014_2026_year_summary_v4.csv?raw";

type PrelimSubject = { name: string; total: number; avg: number; early: number; middle: number; recent: number; color: string };
type MainsTopic = { name: string; total: number; share: number; years: number; avg: number; early: number; late: number };
type MainsTrendData = { source_note: string; years: number[]; rows: { paper: string; subject: string; topic: string; marks: Record<string, number | null> }[] };
type SubjectWeightData = { note: string; subjects: { subject: string; gs: string; prelimsQuestions: number | null; prelimsTagStatus: string; mainsTaggedMarks2013_2026: number | null; mainsAverageTaggedMarksPerYear: number | null; mains2026TaggedMarks: number | null; mainsTopicRows: number }[] };
type ResearchFindings = { cutoff: string; rules: string[]; latest_2026_style_signals: Record<string, number | string>; engine_implications: string[] };

const mainsTrendData = JSON.parse(mainsTrendRaw) as MainsTrendData;
const subjectWeightData = JSON.parse(subjectWeightsRaw) as SubjectWeightData;
const researchFindings = JSON.parse(researchFindingsRaw) as ResearchFindings;
const [pyqYearHeader = "", ...pyqYearLines] = pyqYearSummaryRaw.trim().split(/\r?\n/);
const pyqYearFields = pyqYearHeader.split(",");
const pyqYearSummary = pyqYearLines.map((line) => Object.fromEntries(line.split(",").map((value, index) => [pyqYearFields[index], Number(value)])) as Record<string, number>);

const prelimSubjects: PrelimSubject[] = [
  { name: "Economy", total: 241, avg: 20.1, early: 21.8, middle: 19.2, recent: 18, color: "#C8640E" },
  { name: "Environment", total: 213, avg: 17.8, early: 18.6, middle: 18.6, recent: 13.5, color: "#1D7657" },
  { name: "Polity", total: 169, avg: 14.1, early: 12.6, middle: 14.6, recent: 16.5, color: "#0F5B78" },
  { name: "Sci & Tech", total: 163, avg: 13.6, early: 13, middle: 13.8, recent: 14.5, color: "#843B62" },
  { name: "History", total: 140, avg: 11.7, early: 11.6, middle: 12.6, recent: 9.5, color: "#B8860B" },
  { name: "Geography", total: 129, avg: 10.8, early: 8.8, middle: 10.8, recent: 15.5, color: "#397B9A" },
  { name: "Current Affairs", total: 78, avg: 6.5, early: 6.8, middle: 5.8, recent: 7.5, color: "#68784C" },
  { name: "Art & Culture", total: 61, avg: 5.1, early: 6.6, middle: 4.2, recent: 3.5, color: "#AA4D36" },
  { name: "International Relations", total: 5, avg: 0.4, early: 0.2, middle: 0.2, recent: 1.5, color: "#526273" },
  { name: "Sports", total: 1, avg: 0, early: 0, middle: 0.2, recent: 0, color: "#84929B" },
];

const prelimYears = [
  [2014, 14, 22, 10, 17, 8, 13, 3, 13], [2015, 23, 18, 12, 10, 13, 11, 9, 4],
  [2016, 26, 22, 5, 13, 12, 6, 11, 5], [2017, 26, 16, 22, 10, 10, 6, 5, 4],
  [2018, 20, 15, 14, 15, 15, 8, 6, 7], [2019, 26, 18, 14, 16, 11, 9, 2, 4],
  [2020, 21, 19, 16, 14, 18, 8, 2, 2], [2021, 15, 24, 17, 12, 15, 7, 5, 5],
  [2022, 17, 17, 11, 17, 12, 12, 10, 4], [2023, 17, 15, 15, 10, 7, 18, 10, 6],
  [2024, 15, 14, 20, 13, 4, 18, 9, 6], [2025, 21, 13, 13, 16, 15, 13, 6, 1],
];
const prelimColumns = ["Year", "Economy", "Environment", "Polity", "Sci & Tech", "History", "Geography", "Current Affairs", "Art & Culture"];
const baseline2026 = ["Economy 18", "Sci & Tech 15", "History 13", "Polity 9", "Environment 8", "Art & Culture 8", "Geography 7", "Current Affairs + IR 19", "Ethics/Gov case 3"];

const mainsTopics: Record<string, MainsTopic[]> = {
  "GS-I": [
    { name: "Indian Society / Diversity / Social Empowerment", total: 480, share: 13.7, years: 14, avg: 34.3, early: 29, late: 38 },
    { name: "Freedom Struggle", total: 402, share: 11.5, years: 14, avg: 28.8, early: 37.5, late: 18 },
    { name: "Art & Culture (Heritage)", total: 395, share: 11.3, years: 14, avg: 28.2, early: 24, late: 34 },
    { name: "World Physical Geography / Geophysics", total: 372, share: 10.6, years: 12, avg: 26.6, early: 16.5, late: 41 },
    { name: "Natural Resources Distribution", total: 330, share: 9.4, years: 12, avg: 23.6, early: 28, late: 22 },
    { name: "Changes in Geo Features / Flora-Fauna", total: 300, share: 8.6, years: 13, avg: 21.4, early: 26, late: 12 },
    { name: "Population, Poverty, Development", total: 237, share: 6.8, years: 10, avg: 17, early: 9.5, late: 19 },
    { name: "World History + Political Philosophy", total: 217, share: 6.2, years: 11, avg: 15.5, early: 23.5, late: 11 },
    { name: "Location of Industries", total: 202, share: 5.8, years: 11, avg: 14.5, early: 13.5, late: 15 },
    { name: "Urbanization", total: 190, share: 5.4, years: 12, avg: 13.6, early: 15, late: 11 },
    { name: "Globalization & Society", total: 130, share: 3.7, years: 9, avg: 9.3, early: 7, late: 13 },
    { name: "Women & Women Organizations", total: 122, share: 3.5, years: 8, avg: 8.8, early: 10.5, late: 4 },
    { name: "Post-Independence Consolidation", total: 120, share: 3.4, years: 5, avg: 8.6, early: 10, late: 12 },
  ],
  "GS-II": [
    { name: "International Institutions & Groupings", total: 342, share: 9.8, years: 14, avg: 24.5, early: 24.5, late: 26 },
    { name: "Constitution Features / Comparison", total: 327, share: 9.4, years: 14, avg: 23.4, early: 17.5, late: 31 },
    { name: "Constitutional Posts & Bodies", total: 325, share: 9.3, years: 13, avg: 23.2, early: 22, late: 17 },
    { name: "Legislatures, Privileges, RPA", total: 320, share: 9.1, years: 13, avg: 22.9, early: 17, late: 24 },
    { name: "Policies / NGOs / SHGs / Pressure Groups", total: 317, share: 9.1, years: 14, avg: 22.7, early: 29.5, late: 20 },
    { name: "Federalism & Local Devolution", total: 315, share: 9, years: 13, avg: 22.5, early: 20, late: 26 },
    { name: "Social Sector (Health / Education / HR)", total: 282, share: 8.1, years: 13, avg: 20.2, early: 23.5, late: 17 },
    { name: "Welfare Schemes: Vulnerable Sections", total: 275, share: 7.9, years: 10, avg: 19.6, early: 13, late: 25 },
    { name: "Governance / E-gov / Transparency", total: 207, share: 5.9, years: 11, avg: 14.8, early: 16.5, late: 16 },
    { name: "Development Policies / Developing Countries", total: 202, share: 5.8, years: 11, avg: 14.5, early: 7.5, late: 11 },
    { name: "India & Neighbourhood", total: 197, share: 5.6, years: 9, avg: 14.1, early: 26.5, late: 13 },
    { name: "Poverty & Hunger", total: 112, share: 3.2, years: 8, avg: 8, early: 7.5, late: 7 },
    { name: "Executive & Judiciary Structure", total: 110, share: 3.1, years: 7, avg: 7.9, early: 12, late: 8 },
    { name: "Separation of Powers / Disputes", total: 92, share: 2.6, years: 7, avg: 6.6, early: 4.5, late: 5 },
    { name: "Role of Civil Services", total: 70, share: 2, years: 6, avg: 5, early: 8, late: 4 },
  ],
  "GS-III": [
    { name: "Environment (Conservation / Pollution / EIA)", total: 440, share: 12.6, years: 14, avg: 31.4, early: 24, late: 35 },
    { name: "Indian Economy / Inclusive Growth", total: 390, share: 11.1, years: 14, avg: 27.9, early: 24, late: 29 },
    { name: "S&T Developments, IT / Bio / IPR", total: 360, share: 10.3, years: 13, avg: 25.7, early: 20, late: 31 },
    { name: "Extremism / Organized Crime / Terrorism", total: 262, share: 7.5, years: 13, avg: 18.8, early: 17.5, late: 22 },
    { name: "Disaster Management", total: 255, share: 7.3, years: 14, avg: 18.2, early: 15, late: 20 },
    { name: "Crops / Cropping / Irrigation", total: 247, share: 7.1, years: 11, avg: 17.7, early: 10.5, late: 16 },
    { name: "Border Areas / Forces / External Actors", total: 222, share: 6.4, years: 13, avg: 15.9, early: 19.5, late: 12 },
    { name: "Cyber Security / Media / Communication Networks", total: 190, share: 5.4, years: 12, avg: 13.6, early: 17, late: 12 },
    { name: "S&T Achievements / Indigenisation", total: 185, share: 5.3, years: 11, avg: 13.2, early: 15, late: 13 },
    { name: "Infrastructure & Investment Models", total: 177, share: 5.1, years: 9, avg: 12.7, early: 14.5, late: 13 },
    { name: "Food Processing / Storage / Animal Husbandry", total: 172, share: 4.9, years: 10, avg: 12.3, early: 11.5, late: 14 },
    { name: "Liberalisation & Industrial Policy", total: 170, share: 4.9, years: 8, avg: 12.1, early: 24, late: 7 },
    { name: "Subsidies, MSP, PDS", total: 142, share: 4.1, years: 10, avg: 10.2, early: 9.5, late: 11 },
    { name: "Government Budgeting", total: 97, share: 2.8, years: 7, avg: 7, early: 9.5, late: 3 },
    { name: "Land Reforms", total: 77, share: 2.2, years: 7, avg: 5.5, early: 9.5, late: 4 },
    { name: "E-tech for Farmers / Technology Missions", total: 55, share: 1.6, years: 5, avg: 3.9, early: 7, late: 4 },
    { name: "Money Laundering", total: 50, share: 1.4, years: 4, avg: 3.6, early: 2, late: 3 },
  ],
  "GS-IV": [
    { name: "Case Study: Public Sector", total: 850, share: 24.3, years: 14, avg: 60.7, early: 46, late: 60 },
    { name: "Moral Thinkers (Indian & World)", total: 410, share: 11.7, years: 14, avg: 29.3, early: 24, late: 32 },
    { name: "Public Service Values / Administration", total: 370, share: 10.6, years: 14, avg: 26.4, early: 20, late: 22 },
    { name: "Case Study: Private Sector", total: 365, share: 10.4, years: 11, avg: 26.1, early: 37, late: 20 },
    { name: "Case Study: Society", total: 190, share: 5.4, years: 6, avg: 13.6, early: 22, late: 16 },
    { name: "Aptitude / Foundational Values", total: 175, share: 5, years: 11, avg: 12.5, early: 15, late: 12 },
    { name: "Ethics in IR & Corporate Governance", total: 160, share: 4.6, years: 9, avg: 11.4, early: 8, late: 18 },
    { name: "Codes of Ethics / Charters", total: 160, share: 4.6, years: 9, avg: 11.4, early: 10, late: 14 },
    { name: "Case Study: Individual Morality", total: 160, share: 4.6, years: 7, avg: 11.4, early: 8, late: 12 },
    { name: "Case Study: Applied Ethics", total: 140, share: 4, years: 6, avg: 10, early: 12, late: 12 },
    { name: "Probity in Governance / RTI", total: 130, share: 3.7, years: 9, avg: 9.3, early: 8, late: 12 },
    { name: "Ethics & Human Interface", total: 120, share: 3.4, years: 10, avg: 8.6, early: 10, late: 12 },
    { name: "Human Values / Leaders' Lives", total: 100, share: 2.9, years: 6, avg: 7.1, early: 14, late: 2 },
    { name: "Emotional Intelligence", total: 100, share: 2.9, years: 10, avg: 7.1, early: 8, late: 4 },
    { name: "Attitude", total: 70, share: 2, years: 7, avg: 5, early: 8, late: 2 },
  ],
};

const fmtTrend = (topic: MainsTopic) => {
  const delta = Math.round((topic.late - topic.early) * 10) / 10;
  return { delta, label: delta >= 5 ? "Rising" : delta <= -5 ? "Falling" : "Stable" };
};

export default function ExamAnalysis() {
  const [exam, setExam] = useState<"Prelims" | "Mains" | "Philosophy Optional">("Prelims");
  const [paper, setPaper] = useState("GS-I");
  const [selectedSubject, setSelectedSubject] = useState("Geography");
  const [selectedTopic, setSelectedTopic] = useState<MainsTopic | null>(null);
  const [selectedMainsYear, setSelectedMainsYear] = useState(2026);
  const [selectedMainsTrend, setSelectedMainsTrend] = useState<string | null>(null);
  const topics = mainsTopics[paper];
  const selectedPrelim = prelimSubjects.find((subject) => subject.name === selectedSubject) ?? prelimSubjects[0];
  const pie = prelimSubjects.slice(0, 8).map((subject) => ({ name: subject.name, value: subject.total, color: subject.color }));
  const mainsYearRows = mainsTrendData.rows.filter((row) => row.paper === paper).map((row) => ({ ...row, selectedMarks: row.marks[String(selectedMainsYear)] ?? null })).sort((left, right) => (right.selectedMarks ?? -1) - (left.selectedMarks ?? -1));
  const selectedMainsTrendRow = mainsTrendData.rows.find((row) => row.paper === paper && row.topic === selectedMainsTrend);
  const selectedMainsTrendSeries = selectedMainsTrendRow ? mainsTrendData.years.map((year) => ({ year, marks: selectedMainsTrendRow.marks[String(year)] ?? null })) : [];
  const ownSessions = useSessions(200);
  const ownTests = useTests();
  const optionalSessions = (ownSessions.data ?? []).filter((session) => session.subject_id === "optional");
  const optionalTopicMinutes = Object.values(optionalSessions.reduce<Record<string, { topic: string; minutes: number }>>((totals, session) => {
    totals[session.topic] ??= { topic: session.topic, minutes: 0 };
    totals[session.topic].minutes += session.duration_minutes;
    return totals;
  }, {})).sort((left, right) => right.minutes - left.minutes).slice(0, 12);
  const optionalTests = (ownTests.data ?? []).filter((test) => test.subject_id === "optional").sort((left, right) => left.date.localeCompare(right.date));

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        overline="Research desk · supplied dataset"
        title="UPSC Trend Atlas"
        description="Clickable Prelims and Mains frequency analysis. Coaching-tagged and third-party figures below are descriptive, not official classifications or predictions."
        actions={<div className="flex rounded-lg border border-[#D8D3C7] bg-white p-1" role="group" aria-label="Exam analysis view">
          {(["Prelims", "Mains", "Philosophy Optional"] as const).map((view) => <Button key={view} size="sm" variant={exam === view ? "default" : "ghost"} onClick={() => setExam(view)} aria-pressed={exam === view} className={exam === view ? "bg-[#1D3A2C] text-white" : ""}>{view}</Button>)}
        </div>}
      />

      <div className="flex flex-wrap items-center gap-2 border-y border-[#DED9CE] py-3 text-xs text-[#5E6258]">
        <Badge className="border-0 bg-[#FEF3E2] text-[#8A3D04]">Unofficial analysis</Badge>
        <span>Source: figures supplied in this workspace conversation</span>
        <span aria-hidden>·</span><span>Blank or absent years are not interpolated</span>
        <span aria-hidden>·</span><span>Observed frequency is not a forecast</span>
      </div>

      {exam === "Prelims" ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Questions analysed" value="1,200" sub="2014–2025 · 12 papers" />
          <StatCard label="Highest average" value="Economy · 20.1" sub="questions per paper" />
          <StatCard label="Largest recent rise" value="Geography · 15.5" sub="average in 2024–25" accent />
          <StatCard label="2026 baseline" value="100" sub="analytical allocation · separate" />
        </div>
        <div className="grid gap-5 lg:grid-cols-12">
          <section className="rounded-xl border border-[#E4DED2] bg-white p-5 lg:col-span-8">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase text-[#0F5B78]">2014–2025 · questions per paper</p><h2 className="mt-1 font-serif text-xl">Year-by-year subject matrix</h2></div><label className="text-xs text-[#5E6258]">Inspect <select className="ml-2 rounded-md border border-[#D8D3C7] bg-white px-2 py-1" value={selectedSubject} onChange={(event) => setSelectedSubject(event.target.value)}>{prelimSubjects.map((subject) => <option key={subject.name}>{subject.name}</option>)}</select></label></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-right text-xs"><thead><tr className="border-b border-[#E8E3D7] text-[10px] uppercase text-[#73766E]">{prelimColumns.map((col) => <th key={col} className="px-2 py-2 font-medium">{col === "Current Affairs" ? "CA" : col}</th>)}</tr></thead><tbody>{prelimYears.map((row) => <tr key={row[0]} className="border-b border-[#F1EEE7]">{row.map((value, index) => <td key={`${row[0]}-${index}`} className="px-2 py-2 tabular-nums"><span className={index === 0 ? "font-semibold text-[#1C1D18]" : "inline-block min-w-7 rounded-sm px-1 py-0.5"} style={index === prelimColumns.indexOf(selectedSubject) ? { backgroundColor: `${selectedPrelim.color}${value > 15 ? "35" : "19"}`, color: selectedPrelim.color, fontWeight: 700 } : undefined}>{value}</span></td>)}</tr>)}</tbody></table></div>
            <p className="mt-3 text-[11px] text-[#73766E]">Select a subject to highlight its yearly counts. Coaching taxonomy; 2026 is deliberately kept as a separate estimate.</p>
          </section>
          <section className="rounded-xl border border-[#E4DED2] bg-white p-5 lg:col-span-4"><p className="font-mono text-[10px] uppercase text-[#C8640E]">2014–2025 total</p><h2 className="mt-1 font-serif text-xl">Question share</h2><div className="h-64"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={pie} dataKey="value" nameKey="name" innerRadius={54} outerRadius={92} paddingAngle={2} onClick={(data) => setSelectedSubject(String(data.name))}>{pie.map((entry) => <Cell key={entry.name} fill={entry.color} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div><ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">{pie.map((subject) => <li key={subject.name}><button className="flex items-center gap-1.5 text-left hover:underline" onClick={() => setSelectedSubject(subject.name)}><span className="size-2 rounded-full" style={{ backgroundColor: subject.color }} />{subject.name}</button></li>)}</ul></section>
          <section className="rounded-xl border border-[#E4DED2] bg-white p-5 lg:col-span-7"><div className="mb-3"><p className="font-mono text-[10px] uppercase text-[#1D7657]">Subject trend · average questions / year</p><h2 className="mt-1 font-serif text-xl">Recent movement by subject</h2></div><div className="h-72"><ResponsiveContainer width="100%" height="100%"><BarChart data={prelimSubjects.slice(0, 9)} margin={{ top: 8, right: 10, left: -18, bottom: 30 }}><CartesianGrid stroke="#F0EDE5" vertical={false} /><XAxis dataKey="name" angle={-25} textAnchor="end" interval={0} height={65} tick={{ fontSize: 10, fill: "#5E6258" }} /><YAxis tick={{ fontSize: 10, fill: "#5E6258" }} /><Tooltip /><Bar dataKey="early" name="2014–18" fill="#B7C9BD" radius={[3, 3, 0, 0]} /><Bar dataKey="middle" name="2019–23" fill="#0F5B78" radius={[3, 3, 0, 0]} /><Bar dataKey="recent" name="2024–25" fill="#C8640E" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div><div className="mt-2 flex flex-wrap gap-2">{prelimSubjects.slice(0, 9).map((subject) => <button key={subject.name} onClick={() => setSelectedSubject(subject.name)} className={`rounded-md px-2 py-1 text-[11px] ${selectedSubject === subject.name ? "bg-[#1C1D18] text-white" : "bg-[#F6F2E9] text-[#383A34]"}`}>{subject.name}</button>)}</div><p className="mt-3 text-sm text-[#5E6258]">{selectedSubject}: {selectedPrelim.early} (2014–18), {selectedPrelim.middle} (2019–23), {selectedPrelim.recent} (2024–25). {selectedSubject === "Geography" ? "Largest recent increase in this supplied series." : selectedSubject === "Environment" ? "Recent average is lower than the 2014–23 bands." : "Interpret changes as observed frequency, not guaranteed future weight."}</p></section>
          <section className="rounded-xl border border-[#E4DED2] bg-white p-5 lg:col-span-5"><p className="font-mono text-[10px] uppercase text-[#843B62]">2026 · analytical allocation</p><h2 className="mt-1 font-serif text-xl">Baseline snapshot</h2><div className="mt-4 flex flex-wrap gap-2">{baseline2026.map((item) => <span key={item} className="rounded-md border border-[#E8E3D7] px-2.5 py-1.5 text-xs">{item}</span>)}</div><div className="mt-5 border-t border-[#E8E3D7] pt-4"><p className="text-sm font-medium">Format shift</p><p className="mt-1 text-xs leading-relaxed text-[#5E6258]">Single-answer questions: 46–59 (2014–16) to 18 (2025). Count questions rose from 8 in 2022 to 47 in 2023. 2026 estimate: coded statements 55, direct 19, count 7, relationship 7, match 8, scenario 4.</p><p className="mt-3 text-xs leading-relaxed text-[#5E6258]">Elimination-compatible structure: 706/1,200 (58.8%). Negative/exception cues: 112 (9.3%). Explicit current-affairs tags: 78 (6.5%). Labels and estimates are third-party, not official UPSC categories.</p></div></section>
        </div>
        <section className="rounded-xl border border-[#E4DED2] bg-white p-5">
          <p className="font-mono text-[10px] uppercase text-[#0F5B78]">Portal PYQ audit · 2014–2026</p>
          <h2 className="mt-1 font-serif text-xl">Question structure and source coverage</h2>
          <p className="mt-2 text-xs leading-relaxed text-[#5E6258]">Imported from the linked repository’s yearly summary. It counts all papers as 100 questions; source verification and full-text coverage are separate fields. 2026 is an analytical baseline, not a verified machine-readable question set.</p>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[820px] text-left text-xs"><thead className="bg-[#F6F2E9] text-[10px] uppercase text-[#5E6258]"><tr>{["Year", "Subjects", "Negative stems", "Explicit CA", "Avg statements", "Avg stem words", "Full text", "Source verified"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{pyqYearSummary.map((row) => <tr key={row.year} className="border-t border-[#F0EDE5]"><td className="px-3 py-2 font-semibold">{row.year}</td><td className="px-3 py-2">{row.subjects}</td><td className="px-3 py-2">{row.negative_stem}</td><td className="px-3 py-2">{row.explicit_ca}</td><td className="px-3 py-2">{row.mean_statement_count.toFixed(2)}</td><td className="px-3 py-2">{row.mean_stem_words.toFixed(1)}</td><td className="px-3 py-2">{row.full_text_rows}/100</td><td className="px-3 py-2">{row.source_verified}/100</td></tr>)}</tbody></table></div>
        </section>
        <section className="rounded-xl border border-[#E4DED2] bg-white p-5">
          <p className="font-mono text-[10px] uppercase text-[#843B62]">Cross-paper weights · portal taxonomy</p>
          <h2 className="mt-1 font-serif text-xl">Prelims tags alongside Mains marks</h2>
          <p className="mt-2 text-xs leading-relaxed text-[#5E6258]">Null means “not separately tagged” in the source, not zero. Mains labels may overlap and are not unique paper totals.</p>
          <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-[#F6F2E9] text-[10px] uppercase text-[#5E6258]"><tr>{["Subject", "Paper", "Prelims tagged questions", "2013–26 Mains tagged marks", "2026 tagged marks", "Topic rows"].map((label) => <th key={label} className="px-3 py-2 font-medium">{label}</th>)}</tr></thead><tbody>{subjectWeightData.subjects.map((row) => <tr key={`${row.gs}-${row.subject}`} className="border-t border-[#F0EDE5]"><td className="px-3 py-2 font-medium">{row.subject}</td><td className="px-3 py-2">{row.gs}</td><td className="px-3 py-2">{row.prelimsQuestions ?? "Not separately tagged"}</td><td className="px-3 py-2">{row.mainsTaggedMarks2013_2026 ?? "—"}</td><td className="px-3 py-2">{row.mains2026TaggedMarks ?? "—"}</td><td className="px-3 py-2">{row.mainsTopicRows}</td></tr>)}</tbody></table></div>
        </section>
        <section className="rounded-xl border border-[#E4DED2] bg-white p-5">
          <p className="font-mono text-[10px] uppercase text-[#1D7657]">Evidence boundary · current layer cutoff {researchFindings.cutoff}</p>
          <h2 className="mt-1 font-serif text-xl">Research notes</h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">{researchFindings.engine_implications.map((note) => <li key={note} className="border-l-2 border-[#1D7657] pl-3 text-sm leading-relaxed text-[#383A34]">{note}</li>)}</ul>
          <p className="mt-4 text-xs leading-relaxed text-[#73766E]">The source separates historical PYQ structural priors from post-cutoff mock/test evidence. Provider claims are not validated prediction performance; source attribution is not UPSC setter provenance.</p>
        </section>
      </> : exam === "Mains" ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><StatCard label="Period" value="2013–2026" sub="14-year supplied analysis" /><StatCard label="Largest topic pool" value={paper === "GS-IV" ? "Public sector case" : (mainsTopics[paper][0]?.name ?? "—")} sub={`${mainsTopics[paper][0]?.total ?? 0} marks total`} /><StatCard label="GS-IV split" value="51.3 / 48.7%" sub="Section A theory / Section B cases" /><StatCard label="Interpretation" value="Frequency" sub="not a prediction" accent /></div>
        <div className="grid gap-5 lg:grid-cols-12">
          <section className="rounded-xl border border-[#E4DED2] bg-white p-5 lg:col-span-5"><p className="font-mono text-[10px] uppercase text-[#0F5B78]">Paper selector</p><h2 className="mt-1 font-serif text-xl">Topic share map</h2><div className="mt-4 flex flex-wrap gap-2">{Object.keys(mainsTopics).map((key) => <Button key={key} size="sm" variant={paper === key ? "default" : "outline"} onClick={() => { setPaper(key); setSelectedTopic(null); }} aria-pressed={paper === key}>{key}</Button>)}</div><div className="mt-4 h-60"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={topics} dataKey="share" nameKey="name" innerRadius={54} outerRadius={95} paddingAngle={1} onClick={(data) => setSelectedTopic(data as unknown as MainsTopic)}>{topics.map((topic, index) => <Cell key={topic.name} fill={["#C8640E", "#0F5B78", "#1D7657", "#843B62", "#B8860B", "#397B9A", "#AA4D36"][index % 7]} />)}</Pie><Tooltip formatter={(value: number) => [`${value}%`, "Paper share"]} /></PieChart></ResponsiveContainer></div><p className="text-xs leading-relaxed text-[#5E6258]">Click a slice or topic row to inspect its supplied marks, appearance frequency, and early/late averages. Shares refer to the analysis total shown for each paper.</p></section>
          <section className="rounded-xl border border-[#E4DED2] bg-white p-5 lg:col-span-7"><div className="mb-3"><p className="font-mono text-[10px] uppercase text-[#C8640E]">Early average vs late average</p><h2 className="mt-1 font-serif text-xl">Which topics moved?</h2></div><div className="h-[390px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={topics.slice(0, 12)} layout="vertical" margin={{ top: 4, right: 18, left: 8, bottom: 4 }}><CartesianGrid stroke="#F0EDE5" horizontal={false} /><XAxis type="number" tick={{ fontSize: 10, fill: "#5E6258" }} /><YAxis type="category" dataKey="name" width={185} tick={{ fontSize: 9, fill: "#5E6258" }} /><Tooltip /><Bar dataKey="early" name="Early average" fill="#0F5B78" radius={[0, 3, 3, 0]} /><Bar dataKey="late" name="Late average" fill="#C8640E" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div><div className="mt-3 flex flex-wrap gap-2 text-[11px]">{topics.slice(0, 8).map((topic) => <button key={topic.name} onClick={() => setSelectedTopic(topic)} className={`rounded-md px-2 py-1 ${selectedTopic?.name === topic.name ? "bg-[#1C1D18] text-white" : "bg-[#F6F2E9] text-[#383A34]"}`}>{topic.name}</button>)}</div></section>
          <section className="overflow-hidden rounded-xl border border-[#E4DED2] bg-white lg:col-span-12"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#E8E3D7] p-5"><div><p className="font-mono text-[10px] uppercase text-[#1D7657]">Marks-based topic records</p><h2 className="mt-1 font-serif text-xl">{paper} topic ledger</h2></div><span className="text-xs text-[#5E6258]">Early: 2013–17 · Late: 2022–26 · Yrs: appearances / 14</span></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-xs"><thead className="bg-[#F6F2E9] text-[10px] uppercase text-[#5E6258]"><tr>{["Topic", "Total", "Share", "Years", "Avg/yr", "Early", "Late", "Trend"].map((heading) => <th key={heading} className="px-3 py-2.5 font-medium">{heading}</th>)}</tr></thead><tbody>{topics.map((topic) => { const trend = fmtTrend(topic); return <tr key={topic.name} className={`cursor-pointer border-t border-[#F0EDE5] hover:bg-[#FBF9F4] ${selectedTopic?.name === topic.name ? "bg-[#FEF3E2]/60" : ""}`} onClick={() => setSelectedTopic(topic)}><td className="max-w-[340px] px-3 py-2.5 font-medium">{topic.name}</td><td className="px-3 py-2.5 tabular-nums">{topic.total}</td><td className="px-3 py-2.5 tabular-nums">{topic.share}%</td><td className="px-3 py-2.5 tabular-nums">{topic.years}/14</td><td className="px-3 py-2.5 tabular-nums">{topic.avg}</td><td className="px-3 py-2.5 tabular-nums">{topic.early}</td><td className="px-3 py-2.5 tabular-nums">{topic.late}</td><td className={`px-3 py-2.5 font-medium ${trend.delta >= 5 ? "text-[#1D7657]" : trend.delta <= -5 ? "text-[#B3452F]" : "text-[#5E6258]"}`}>{trend.label} {trend.delta > 0 ? "+" : ""}{trend.delta}</td></tr>; })}</tbody></table></div>{selectedTopic ? <div className="border-t border-[#E8E3D7] bg-[#FBF9F4] px-5 py-4 text-sm"><strong>{selectedTopic.name}</strong><span className="ml-2 text-[#5E6258]">{selectedTopic.total} marks across {selectedTopic.years} years; late-minus-early average {fmtTrend(selectedTopic).delta > 0 ? "+" : ""}{fmtTrend(selectedTopic).delta} marks.</span><button className="ml-3 text-xs text-[#0F5B78] underline" onClick={() => setSelectedTopic(null)}>Clear selection</button></div> : null}</section>
        </div>
        <section className="rounded-xl border border-[#E4DED2] bg-white p-5">
          <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="font-mono text-[10px] uppercase text-[#0F5B78]">Repository source · marks by topic and year</p><h2 className="mt-1 font-serif text-xl">{paper} annual topic matrix</h2></div><label className="text-xs text-[#5E6258]">Selected year <strong>{selectedMainsYear}</strong></label></div>
          <div className="mt-4 flex flex-wrap gap-1.5">{mainsTrendData.years.map((year) => <Button key={year} size="xs" variant={selectedMainsYear === year ? "default" : "outline"} aria-pressed={selectedMainsYear === year} onClick={() => setSelectedMainsYear(year)}>{year}</Button>)}</div>
          <div className="mt-4 grid gap-5 xl:grid-cols-2"><div className="h-[350px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={mainsYearRows.slice(0, 14)} layout="vertical" margin={{ top: 4, right: 15, left: 4, bottom: 4 }}><CartesianGrid stroke="#F0EDE5" horizontal={false} /><XAxis type="number" tick={{ fontSize: 10, fill: "#5E6258" }} /><YAxis type="category" dataKey="topic" width={210} tick={{ fontSize: 9, fill: "#5E6258" }} /><Tooltip formatter={(value) => [value == null ? "No supplied value" : `${value} marks`, ""]} /><Bar dataKey="selectedMarks" name={`${selectedMainsYear} marks`} fill="#0F5B78" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div><div className="max-h-[350px] overflow-y-auto"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#F6F2E9] text-[10px] uppercase text-[#5E6258]"><tr><th className="px-2 py-2">Topic</th><th className="px-2 py-2">Subject</th><th className="px-2 py-2 text-right">Marks</th></tr></thead><tbody>{mainsYearRows.map((row) => <tr key={row.topic} className={`border-t border-[#F0EDE5] ${selectedMainsTrend === row.topic ? "bg-[#FEF3E2]" : ""}`}><td className="px-2 py-2"><button className="text-left hover:text-[#0F5B78] hover:underline" onClick={() => setSelectedMainsTrend(row.topic)}>{row.topic}</button></td><td className="px-2 py-2 text-[#5E6258]">{row.subject}</td><td className="px-2 py-2 text-right font-mono">{row.selectedMarks === null ? "—" : row.selectedMarks}</td></tr>)}</tbody></table></div></div>
          {selectedMainsTrendRow ? <div className="mt-4 border-t border-[#E8E3D7] pt-4"><h3 className="font-medium">{selectedMainsTrendRow.topic} · marks across all years</h3><div className="mt-2 h-48"><ResponsiveContainer width="100%" height="100%"><BarChart data={selectedMainsTrendSeries} margin={{ top: 8, right: 10, left: -20, bottom: 0 }}><CartesianGrid stroke="#F0EDE5" vertical={false} /><XAxis dataKey="year" tick={{ fontSize: 10, fill: "#5E6258" }} /><YAxis tick={{ fontSize: 10, fill: "#5E6258" }} /><Tooltip formatter={(value) => [value == null ? "No supplied value" : `${value} marks`, ""]} /><Bar dataKey="marks" name="Marks" fill="#C8640E" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div></div> : <p className="mt-4 text-xs text-[#5E6258]">Choose a topic to see its complete year-by-year marks series.</p>}
          <p className="mt-4 border-t border-[#E8E3D7] pt-3 text-xs leading-relaxed text-[#73766E]">{mainsTrendData.source_note} The original source notes use analyst-tagged marks; they are not an official UPSC weightage classification.</p>
        </section>
      </> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Optional study logged" value={`${Math.floor(optionalSessions.reduce((sum, session) => sum + session.duration_minutes, 0) / 60)}h`} sub={`${optionalSessions.length} recent sessions`} />
          <StatCard label="Topics tracked" value={String(optionalTopicMinutes.length)} sub="from your own session labels" />
          <StatCard label="Optional tests" value={String(optionalTests.length)} sub="user-recorded results" />
          <StatCard label="External optional trends" value="Not supplied" sub="no optional year-series in source archive" />
        </div>
        <div className="grid gap-5 lg:grid-cols-12">
          <section className="rounded-xl border border-[#E4DED2] bg-white p-5 lg:col-span-7">
            <p className="font-mono text-[10px] uppercase text-[#843B62]">Your recent session log · latest 200</p>
            <h2 className="mt-1 font-serif text-xl">Philosophy Optional topic time</h2>
            {optionalTopicMinutes.length ? <div className="mt-4 h-[340px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={optionalTopicMinutes} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }}><CartesianGrid stroke="#F0EDE5" horizontal={false} /><XAxis type="number" tick={{ fontSize: 10, fill: "#5E6258" }} /><YAxis type="category" dataKey="topic" width={210} tick={{ fontSize: 9, fill: "#5E6258" }} /><Tooltip formatter={(value) => [`${value} minutes`, "Study time"]} /><Bar dataKey="minutes" fill="#843B62" radius={[0, 3, 3, 0]} /></BarChart></ResponsiveContainer></div> : <p className="mt-4 rounded-md bg-[#F6F2E9] p-4 text-sm text-[#5E6258]">No Philosophy Optional sessions are logged yet. Choose Philosophy Optional in Log or the study timer to build your personal topic trend.</p>}
          </section>
          <section className="rounded-xl border border-[#E4DED2] bg-white p-5 lg:col-span-5">
            <p className="font-mono text-[10px] uppercase text-[#0F5B78]">Your test records</p>
            <h2 className="mt-1 font-serif text-xl">Optional score progression</h2>
            {optionalTests.length ? <div className="mt-4 h-[300px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={optionalTests.slice(-12)} margin={{ top: 8, right: 8, left: -18, bottom: 8 }}><CartesianGrid stroke="#F0EDE5" vertical={false} /><XAxis dataKey="date" tickFormatter={(date: string) => date.slice(5)} tick={{ fontSize: 9, fill: "#5E6258" }} /><YAxis tick={{ fontSize: 10, fill: "#5E6258" }} /><Tooltip /><Bar dataKey="score" name="Score" fill="#0F5B78" radius={[3, 3, 0, 0]} /><Bar dataKey="max_score" name="Maximum" fill="#D8E6EA" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div> : <p className="mt-4 rounded-md bg-[#F6F2E9] p-4 text-sm text-[#5E6258]">Optional score trends appear after you record a Philosophy Optional sectional test in Mock Tests.</p>}
            <p className="mt-4 border-t border-[#E8E3D7] pt-3 text-xs leading-relaxed text-[#73766E]">This view uses only your own logged sessions and test scores. It does not imply external UPSC optional-topic frequency or predict future papers.</p>
          </section>
        </div>
      </>}
      <p className="border-t border-[#DED9CE] pt-4 text-xs leading-relaxed text-[#73766E]">Data integrity note: all supplied figures are shown as provided, including gaps and independent 2026 estimates. Topic tagging is an analyst taxonomy. Historical frequency, rotation, and trend labels cannot establish future question likelihood.</p>
    </div>
  );
}