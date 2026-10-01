"""Subjects & syllabus topics with computed progress."""

from fastapi import APIRouter, Depends, HTTPException
from pymongo import ReturnDocument

from lib.db import db
from models.tracker import (
    Subject,
    SubjectCreate,
    SubjectOut,
    Topic,
    TopicCreate,
    TopicUpdate,
)
from routers.auth import require_auth

router = APIRouter(prefix="/subjects", tags=["subjects"], dependencies=[Depends(require_auth)])

SYLLABUS_EXPANSIONS = {
    "gs1": [
        "Prelims · Ancient India: sources, archaeology and chronology",
        "Prelims · Indus Valley, Vedic age and Mahajanapadas",
        "Prelims · Maurya, post-Maurya and Gupta period",
        "Prelims · Buddhism, Jainism and ancient literature",
        "Prelims · Medieval kingdoms, Bhakti and Sufi traditions",
        "Prelims · Modern India: 1757–1857 and Governor-Generals",
        "Prelims · National movement: organisations, acts and sessions",
        "Prelims · Indian physical geography, rivers and resources",
        "Mains · Indian society: diversity, population and urbanisation",
        "Mains · Social empowerment, communalism and regionalism",
        "Mains · World physical geography and geophysical phenomena",
        "Mains · Distribution of natural resources and industries",
    ],
    "gs2": [
        "Prelims · Constitutional framework, Preamble and schedules",
        "Prelims · Fundamental Rights, DPSP and Fundamental Duties",
        "Prelims · Parliament, committees, privileges and legislation",
        "Prelims · President, Governor, Council of Ministers and judiciary",
        "Prelims · Constitutional, statutory and regulatory bodies",
        "Prelims · Panchayati Raj, municipalities and local finance",
        "Prelims · Election law, RPA and electoral processes",
        "Prelims · International organisations, treaties and groupings",
        "Mains · Federalism, devolution and Centre-State relations",
        "Mains · Separation of powers and institutional accountability",
        "Mains · Welfare delivery, vulnerable groups and social justice",
        "Mains · Governance, transparency, e-governance and civil services",
    ],
    "gs3": [
        "Prelims · National income, inflation and monetary policy",
        "Prelims · Banking, financial markets and external sector",
        "Prelims · Budget, taxation, fiscal policy and public debt",
        "Prelims · Agriculture, cropping seasons, irrigation and soils",
        "Prelims · MSP, PDS, food security and animal husbandry",
        "Prelims · Ecology, biodiversity, protected areas and conventions",
        "Prelims · Pollution, environmental law and climate change",
        "Prelims · Space, biotechnology, IT and intellectual property",
        "Mains · Inclusive growth, infrastructure and investment models",
        "Mains · Science, indigenisation and technology applications",
        "Mains · Disaster preparedness, mitigation and resilience",
        "Mains · Internal security, cyber threats and border management",
    ],
    "gs4": [
        "Prelims · Ethics terminology, values and public-service principles",
        "Prelims · Integrity, impartiality, objectivity and non-partisanship",
        "Prelims · Accountability, transparency, RTI and citizen charters",
        "Prelims · Emotional intelligence: components and applications",
        "Prelims · Attitude: structure, function and persuasion",
        "Mains · Ethics and human interface: determinants and consequences",
        "Mains · Thinkers: Indian traditions and applied quotations",
        "Mains · Thinkers: Western traditions and practical application",
        "Mains · Public-service values and ethical governance",
        "Mains · Probity, corruption prevention and financial integrity",
        "Mains · Case studies: stakeholder and issue identification",
        "Mains · Case studies: options, consequences and ethical justification",
    ],
    "csat": [
        "Prelims · Reading comprehension: inference and central idea",
        "Prelims · Number systems, divisibility and remainders",
        "Prelims · Percentages, ratios and proportional reasoning",
        "Prelims · Profit, loss, discount and simple interest",
        "Prelims · Time, speed, distance and work",
        "Prelims · Averages, mixtures and data interpretation",
        "Prelims · Permutations, combinations and probability",
        "Prelims · Syllogisms, statements and logical deductions",
        "Prelims · Seating arrangements, directions and relations",
        "Prelims · Decision-making and problem-solving sets",
    ],
}

PHILOSOPHY_TOPICS = [
    "Paper I · Plato: Forms, knowledge, justice and ideal state",
    "Paper I · Aristotle: substance, causation, virtue and polity",
    "Paper I · Descartes: method, mind-body dualism and innate ideas",
    "Paper I · Spinoza: substance monism, attributes and freedom",
    "Paper I · Leibniz: monads, pre-established harmony and theodicy",
    "Paper I · Locke: ideas, primary/secondary qualities and personal identity",
    "Paper I · Berkeley: esse est percipi, idealism and God",
    "Paper I · Hume: causation, induction, self and scepticism",
    "Paper I · Kant: categories, synthetic a priori and antinomies",
    "Paper I · Hegel: dialectic, history and absolute idealism",
    "Paper I · Moore and Russell: realism, analysis and descriptions",
    "Paper I · Wittgenstein: picture theory and language games",
    "Paper I · Logical positivism: verification principle and criticism",
    "Paper I · Phenomenology: Husserl, intentionality and reduction",
    "Paper I · Existentialism: Kierkegaard, Sartre and freedom",
    "Paper I · Quine: indeterminacy, holism and naturalised epistemology",
    "Paper I · Socrates: virtue, knowledge and the examined life",
    "Paper I · Metaphysics: appearance and reality, universals and causation",
    "Paper I · Epistemology: sources, justification, truth and scepticism",
    "Paper I · Ethics: normative theories, moral judgement and free will",
    "Paper I · Equality, liberty, justice and their relationships",
    "Paper I · Sovereignty, rights, duties and political obligation",
    "Paper I · Individual, state, civil society and forms of government",
    "Paper I · Democracy: participation, representation and limits",
    "Paper I · Political ideologies: anarchism, Marxism and socialism",
    "Paper I · Humanism, secularism, multiculturalism and development",
    "Paper I · Religious language, experience and pluralism",
    "Paper I · Arguments for God and the problem of evil",
    "Paper I · Immortality of soul and religion without God",
    "Paper II · Charvaka: perception, materialism and critique of inference",
    "Paper II · Jainism: anekantavada, syadvada and jiva-ajiva",
    "Paper II · Buddhism: Four Noble Truths, dependent origination and no-self",
    "Paper II · Nyaya: pramanas, inference, self and liberation",
    "Paper II · Vaisheshika: categories, atomism and realism",
    "Paper II · Samkhya: purusha, prakriti and evolution",
    "Paper II · Yoga: chitta, eight limbs and liberation",
    "Paper II · Purva Mimamsa: ritual, dharma and validity of knowledge",
    "Paper II · Advaita Vedanta: Brahman, maya and moksha",
    "Paper II · Ramanuja: qualified non-dualism and bhakti",
    "Paper II · Madhva: dualism, God and liberation",
    "Paper II · Aurobindo: integral yoga and evolution",
    "Paper II · Gandhi: truth, non-violence, swaraj and trusteeship",
    "Paper II · Tagore: humanism, nationalism and universalism",
    "Paper II · Vivekananda: practical Vedanta and social service",
    "Paper II · Radhakrishnan: religious experience and idealism",
    "Paper II · Ambedkar: social justice, caste and constitutional morality",
    "Paper II · Comparative Indian and Western theories of knowledge and reality",
]


def _out(doc: dict) -> SubjectOut:
    subject = Subject(**doc)
    total = len(subject.topics)
    done = sum(1 for t in subject.topics if t.done)
    pct = round(done / total * 100, 1) if total else 0.0
    return SubjectOut(**subject.model_dump(), total_topics=total, completed_topics=done, progress_pct=pct)


@router.get("", response_model=list[SubjectOut])
async def list_subjects() -> list[SubjectOut]:
    optional = await db.subjects.find_one({"id": "optional"})
    if optional and optional.get("short_name") != "Philosophy":
        await db.subjects.update_one(
            {"id": "optional", "short_name": optional.get("short_name")},
            {
                "$set": {
                    "name": "Philosophy Optional · Paper I & II",
                    "short_name": "Philosophy",
                    "color": "#6247AA",
                    "topics": [Topic(name=name).model_dump() for name in PHILOSOPHY_TOPICS],
                    "legacy_topics": optional.get("legacy_topics", []) + optional.get("topics", []),
                }
            },
        )
        await db.sessions.update_many(
            {"subject_id": "optional"}, {"$set": {"subject_name": "Philosophy"}}
        )
        await db.tests.update_many(
            {"subject_id": "optional"}, {"$set": {"subject_name": "Philosophy"}}
        )
    for subject_id, names in SYLLABUS_EXPANSIONS.items():
        subject = await db.subjects.find_one({"id": subject_id})
        if not subject:
            continue
        existing_names = {topic.get("name") for topic in subject.get("topics", [])}
        additions = [Topic(name=name).model_dump() for name in names if name not in existing_names]
        if additions:
            await db.subjects.update_one(
                {"id": subject_id}, {"$push": {"topics": {"$each": additions}}}
            )
    docs = await db.subjects.find().sort([("name", 1)]).to_list(200)
    return [_out(d) for d in docs]


@router.post("", response_model=SubjectOut, status_code=201)
async def create_subject(input: SubjectCreate) -> SubjectOut:
    subject = Subject(**input.model_dump())
    await db.subjects.insert_one(subject.model_dump())
    return _out(subject.model_dump())


@router.post("/{sid}/topics", response_model=SubjectOut)
async def add_topic(sid: str, input: TopicCreate) -> SubjectOut:
    res = await db.subjects.find_one_and_update(
        {"id": sid},
        {"$push": {"topics": Topic(name=input.name.strip()).model_dump()}},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Subject not found")
    return _out(res)


@router.patch("/{sid}/topics/{tid}", response_model=SubjectOut)
async def update_topic(sid: str, tid: str, input: TopicUpdate) -> SubjectOut:
    updates = {f"topics.$.{k}": v for k, v in input.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=422, detail="Nothing to update")
    res = await db.subjects.find_one_and_update(
        {"id": sid, "topics.id": tid},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Topic not found")
    return _out(res)


@router.delete("/{sid}/topics/{tid}", response_model=SubjectOut)
async def delete_topic(sid: str, tid: str) -> SubjectOut:
    res = await db.subjects.find_one_and_update(
        {"id": sid},
        {"$pull": {"topics": {"id": tid}}},
        return_document=ReturnDocument.AFTER,
    )
    if not res:
        raise HTTPException(status_code=404, detail="Topic not found")
    return _out(res)
