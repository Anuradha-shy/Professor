"""Seed realistic UPSC demo data — idempotent.
Run: cd /app/backend && python seed.py   (pass --reset to wipe and reseed)."""

import asyncio
import random
import sys
import uuid
from datetime import datetime, timedelta, timezone

from lib.db import db, ensure_indexes
from lib.dates import today_iso

random.seed(1947)


def day(offset: int) -> str:
    """Date string `offset` days from server-today (negative = past)."""
    return (datetime.now(timezone.utc).date() + timedelta(days=offset)).isoformat()


def stamp(day_offset: int, hour: int) -> datetime:
    base = (datetime.now(timezone.utc) + timedelta(days=day_offset)).replace(
        hour=hour, minute=random.randint(0, 59), second=random.randint(0, 59), microsecond=0
    )
    return base


SUBJECTS = [
    {
        "id": "gs1",
        "name": "GS Paper I — History, Art & Culture, Geography, Society",
        "short_name": "GS-I",
        "color": "#C8640E",
        "done_count": 10,
        "topics": [
            "Mauryan Empire: Administration & Society",
            "Gupta Age: Science, Art & Literature",
            "Bhakti & Sufi Movements",
            "1857 Revolt: Causes & Consequences",
            "Moderates & Extremists (1885–1919)",
            "Gandhian Phase of the National Movement",
            "Indian Architecture: Temple & Indo-Islamic",
            "Monsoon Mechanism & Indian Climate",
            "Population & Settlement Geography",
            "Post-Independence Consolidation",
            "World History: Industrial Revolution",
            "World History: World Wars & Decolonisation",
            "Oceanography & Geomorphology",
            "Indian Society: Salient Features & Diversity",
            "Effects of Globalisation on Indian Society",
            "Regional Geography of India",
        ],
    },
    {
        "id": "gs2",
        "name": "GS Paper II — Polity, Governance, Constitution, IR",
        "short_name": "GS-II",
        "color": "#1D3A2C",
        "done_count": 12,
        "topics": [
            "Preamble & Basic Structure Doctrine",
            "Fundamental Rights & Article 21 Jurisprudence",
            "Directive Principles & Fundamental Duties",
            "Parliament: Sessions, Committees, Privileges",
            "Federalism & Centre-State Relations",
            "Judiciary: PIL, Judicial Review, Appointments",
            "Local Governance: 73rd & 74th Amendments",
            "Election Commission & Electoral Reforms",
            "Constitutional & Non-Constitutional Bodies",
            "Pressure Groups & Civil Society",
            "India-China & India-Pakistan Relations",
            "Indian Diaspora & Soft Power",
            "RPA 1950/1951 & Electoral Law",
            "Cooperative Federalism & GST Council",
            "India & the Global South",
            "Governance: e-Gov & Citizen Charters",
        ],
    },
    {
        "id": "gs3",
        "name": "GS Paper III — Economy, Agriculture, Sci-Tech, Environment",
        "short_name": "GS-III",
        "color": "#0F5B78",
        "done_count": 9,
        "topics": [
            "Growth, Development & HDI",
            "Budgeting & Fiscal Policy",
            "Monetary Policy & RBI",
            "Inflation: Causes & Control",
            "Infrastructure: Energy, Ports, Roads",
            "Agriculture: MSP, Irrigation, Farm Reforms",
            "Land Reforms & Food Security",
            "Space Technology: ISRO Missions",
            "Defence Technology & Indigenisation",
            "IPR & Biotechnology Policy",
            "Disaster Management: NDMA Framework",
            "Internal Security: Insurgency & Naxalism",
            "Cyber Security & Money Laundering",
            "Environment: Pollution & Climate Treaties",
            "Conservation: Biodiversity & Wildlife",
            "Investment Models & PPP",
        ],
    },
    {
        "id": "gs4",
        "name": "GS Paper IV — Ethics, Integrity & Aptitude",
        "short_name": "GS-IV",
        "color": "#843B62",
        "done_count": 9,
        "topics": [
            "Ethical Dilemmas in Government",
            "Attitude: Structure & Function",
            "Emotional Intelligence Concepts",
            "Probity in Governance",
            "Code of Conduct vs Code of Ethics",
            "Citizen's Charters & Accountability",
            "Utilitarian & Kantian Thinkers",
            "Case Study Framework Practice",
            "Contributions of Moral Thinkers",
            "Aptitude for Civil Services",
            "Corporate Governance",
            "Ethics in International Relations",
        ],
    },
    {
        "id": "optional",
        "name": "Optional: PSIR Paper 1 & 2",
        "short_name": "PSIR",
        "color": "#6247AA",
        "done_count": 12,
        "topics": [
            "Political Theory: Justice & Equality",
            "Indian Nationalism & Gandhi's Thought",
            "Marxist & Gramscian Perspectives",
            "Comparative Politics: Systems Approach",
            "Indian Constitution: Philosophical Foundations",
            "Federalism & Decentralisation (PSIR lens)",
            "India's Neighbourhood Policy",
            "India-US & India-Russia Relations",
            "UN & Multilateralism",
            "Realism, Liberalism & IR Theory",
            "Nuclear Proliferation Regime",
            "Climate Diplomacy & Global Commons",
            "Feminist Political Thought",
            "Post-Colonial State in Africa",
            "India & West Asia",
            "Regional Organisations: ASEAN, SAARC, EU",
        ],
    },
    {
        "id": "csat",
        "name": "CSAT — Aptitude & Reading Comprehension",
        "short_name": "CSAT",
        "color": "#B8860B",
        "done_count": 8,
        "topics": [
            "Reading Comprehension: Passage Types",
            "Quantitative Aptitude: Percentages",
            "Ratio & Proportion",
            "Data Interpretation: Tables & Charts",
            "Logical Reasoning: Syllogisms",
            "Puzzles & Seating Arrangement",
            "Basic Numeracy: Number System",
            "Venn Diagrams & Set Theory",
            "Time, Speed & Distance",
            "Probability & Permutations",
            "Interpersonal Skills & Communication",
            "Decision Making & Problem Solving",
        ],
    },
]

TOPIC_NAMES = {s["id"]: s["topics"] for s in SUBJECTS}
SUBJECT_SHORT = {s["id"]: s["short_name"] for s in SUBJECTS}

GOALS = [
    {
        "title": "Finish Laxmikanth Polity full revision",
        "description": "One chapter a day with margin notes for Prelims recall.",
        "subject_id": "gs2",
        "priority": "high",
        "target_date": day(12),
        "progress": 70,
        "status": "active",
    },
    {
        "title": "Complete Spectrum Modern History second read",
        "description": "Focus on 1919–1947 chapters and personas.",
        "subject_id": "gs1",
        "priority": "high",
        "target_date": day(25),
        "progress": 45,
        "status": "active",
    },
    {
        "title": "50 Mains answers on PSIR Paper 2",
        "description": "Timed 250-word answers, two per evening.",
        "subject_id": "optional",
        "priority": "medium",
        "target_date": day(40),
        "progress": 30,
        "status": "active",
    },
    {
        "title": "Weekly CSAT sectional every Sunday",
        "description": "Keep quant accuracy above 70%.",
        "subject_id": "csat",
        "priority": "medium",
        "target_date": day(60),
        "progress": 40,
        "status": "active",
    },
    {
        "title": "Shankar Environment summary notes",
        "description": "Condense into 30-page revision booklet.",
        "subject_id": "gs3",
        "priority": "low",
        "target_date": day(75),
        "progress": 15,
        "status": "active",
    },
    {
        "title": "Prelims mock analysis template finalised",
        "description": "Error-log spreadsheet with weak-topic tagging.",
        "subject_id": "gs1",
        "priority": "high",
        "target_date": day(-6),
        "progress": 100,
        "status": "done",
    },
]

# topic, subject_id, source, last_revised offset (None), interval_days, next_due offset, review_count
REVISIONS = [
    ("Fundamental Rights jurisprudence", "gs2", "Laxmikanth", day(-6), 7, 0, 4),
    ("Monsoon Mechanism & Indian Climate", "gs1", "GC Leong", day(-4), 5, -1, 3),
    ("Inflation: Causes & Control", "gs3", "Ramesh Singh", day(-3), 4, 0, 3),
    ("1857 Revolt: Causes & Consequences", "gs1", "Spectrum", day(-8), 6, -2, 2),
    ("Emotional Intelligence Concepts", "gs4", "Subba Rao", day(-2), 3, 0, 2),
    ("Preamble & Basic Structure Doctrine", "gs2", "Laxmikanth", day(-12), 10, 1, 5),
    ("Gandhian Phase of the National Movement", "gs1", "Spectrum", day(-9), 8, 2, 4),
    ("India-US & India-Russia Relations", "optional", "PSIR Notes", day(-5), 7, 3, 3),
    ("Realism, Liberalism & IR Theory", "optional", "Baylis", day(-7), 9, 5, 2),
    ("Disaster Management: NDMA Framework", "gs3", "NCERT + Notes", day(-1), 2, 4, 1),
    ("Data Interpretation: Tables & Charts", "csat", "Practice Book", None, 3, 6, 0),
    ("Bhakti & Sufi Movements", "gs1", "Nitin Singhania", day(-10), 8, 7, 2),
    ("Judiciary: PIL, Judicial Review, Appointments", "gs2", "Laxmikanth", day(-14), 12, 9, 4),
    ("Case Study Framework Practice", "gs4", "Test Series", None, 4, 11, 0),
]

TESTS = [
    ("Vision IAS Prelims PTS #01", "prelims_gs", "gs1", 96, 200, 48.0, day(-118), ["Modern History", "Map-based Geography"]),
    ("Forum CSAT Sectional 03", "prelims_csat", "csat", 118, 200, 59.0, day(-104), ["Reading Comprehension"]),
    ("Insights Prelims Mock #04", "prelims_gs", "gs1", 104, 200, 52.0, day(-90), ["Economy", "Environment"]),
    ("Vision IAS Prelims PTS #02", "prelims_gs", "gs1", 112, 200, 56.0, day(-76), ["Polity", "Current Affairs"]),
    ("Forum CSAT Sectional 05", "prelims_csat", "csat", 124, 200, 62.0, day(-62), ["Data Interpretation"]),
    ("Insights Prelims Mock #06", "prelims_gs", "gs1", 121, 200, 60.5, day(-48), ["Ancient History", "Society"]),
    ("Mains sectional: GS-II Polity", "mains", "gs2", 98, 250, 65.0, day(-40), ["Judiciary", "Federalism"]),
    ("Vision IAS Prelims PTS #03", "prelims_gs", "gs1", 128, 200, 64.0, day(-34), ["Geography", "Art & Culture"]),
    ("Mains sectional: PSIR Paper 2", "mains", "optional", 112, 250, 68.0, day(-27), ["India-US Relations", "Global South"]),
    ("Forum CSAT Sectional 07", "prelims_csat", "csat", 132, 200, 66.0, day(-20), ["Puzzles"]),
    ("Insights Prelims Mock #08", "prelims_gs", "gs1", 133, 200, 66.5, day(-13), ["Environment", "Sci-Tech"]),
    ("Vision IAS Prelims PTS #04", "prelims_gs", "gs1", 138, 200, 69.0, day(-6), ["Economy"]),
]

COLLECTIONS = [
    "subjects", "sessions", "goals", "revisions", "tests",
    "profile", "app_meta", "notion_logs", "notion_mirror", "status_checks",
]


async def main(reset: bool) -> None:
    if reset:
        for name in COLLECTIONS:
            await db[name].drop()
        await ensure_indexes()
        print("Wiped collections.")
    if await db.subjects.count_documents({}) > 0:
        print("Seed skipped — data already present (pass --reset to wipe and reseed).")
        return

    # Subjects with done/undone syllabus topics
    from models.tracker import Subject, Topic  # noqa: E402

    subjects_docs = []
    for spec in SUBJECTS:
        topics = [
            Topic(name=name, done=index < spec["done_count"]).model_dump()
            for index, name in enumerate(spec["topics"])
        ]
        subjects_docs.append(
            Subject(id=spec["id"], name=spec["name"], short_name=spec["short_name"], color=spec["color"], topics=topics).model_dump()
        )
    await db.subjects.insert_many(subjects_docs)

    # Study sessions: ~70 days, a few rest days, unbroken recent streak
    hours = [5, 6, 6, 7, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 21, 22]
    durations = [30, 45, 45, 60, 60, 75, 90, 90, 105, 120, 150, 180]
    weights = [28, 30, 22, 12, 20, 10]
    sessions_docs = []
    for offset in range(69, -1, -1):
        if offset > 21 and random.random() < 0.18:
            continue  # rest day
        for _ in range(random.choices([1, 2, 3], weights=[5, 4, 2])[0]):
            subject_id = random.choices([s["id"] for s in SUBJECTS], weights=weights)[0]
            sessions_docs.append(
                {
                    "id": str(uuid.uuid4()),
                    "subject_id": subject_id,
                    "subject_name": SUBJECT_SHORT[subject_id],
                    "topic": random.choice(TOPIC_NAMES[subject_id]),
                    "duration_minutes": random.choice(durations),
                    "date": day(-offset),
                    "notes": "",
                    "created_at": stamp(-offset, random.choice(hours)),
                }
            )
    await db.sessions.insert_many(sessions_docs)

    from models.tracker import Goal, Revision, TestRecord  # noqa: E402

    goals_docs = [
        Goal(
            title=g["title"], description=g["description"], subject_id=g["subject_id"],
            priority=g["priority"], target_date=g["target_date"], progress=g["progress"], status=g["status"],
        ).model_dump()
        for g in GOALS
    ]
    await db.goals.insert_many(goals_docs)

    revisions_docs = [
        Revision(
            topic=t, subject_id=sid, subject_name=SUBJECT_SHORT[sid], source=src,
            interval_days=interval, last_revised=last, next_due=day(due), review_count=rc,
        ).model_dump()
        for t, sid, src, last, interval, due, rc in REVISIONS
    ]
    await db.revisions.insert_many(revisions_docs)

    tests_docs = [
        TestRecord(
            name=name, kind=kind, subject_id=sid, subject_name=SUBJECT_SHORT[sid],
            score=score, max_score=max_score, accuracy=accuracy, date=date, weak_topics=weak,
        ).model_dump()
        for name, kind, sid, score, max_score, accuracy, date, weak in TESTS
    ]
    await db.tests.insert_many(tests_docs)

    await db.profile.update_one(
        {},
        {
            "$set": {
                "name": "Aryavrat Sharma",
                "target_exam": "UPSC Civil Services Examination 2027",
                "optional_subject": "Political Science & International Relations (PSIR)",
                "daily_target_minutes": 480,
            }
        },
        upsert=True,
    )

    print(
        f"Seeded: {len(SUBJECTS)} subjects, {len(sessions_docs)} sessions, "
        f"{len(GOALS)} goals, {len(REVISIONS)} revisions, {len(TESTS)} tests (today: {today_iso()})."
    )


if __name__ == "__main__":
    asyncio.run(main(reset="--reset" in sys.argv))
