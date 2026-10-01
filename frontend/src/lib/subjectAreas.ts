export interface SubjectArea {
  id: string;
  name: string;
  subjectId: string;
  mode: "Prelims" | "Mains" | "Both";
}

export const SUBJECT_AREAS: SubjectArea[] = [
  { id: "polity", name: "Indian Polity", subjectId: "gs2", mode: "Both" },
  { id: "governance", name: "Governance", subjectId: "gs2", mode: "Mains" },
  { id: "social-justice", name: "Social Justice", subjectId: "gs2", mode: "Mains" },
  { id: "international-relations", name: "International Relations", subjectId: "gs2", mode: "Both" },
  { id: "economy", name: "Economy", subjectId: "gs3", mode: "Both" },
  { id: "agriculture", name: "Agriculture", subjectId: "gs3", mode: "Both" },
  { id: "environment", name: "Environment & Ecology", subjectId: "gs3", mode: "Both" },
  { id: "geography", name: "Geography", subjectId: "gs1", mode: "Both" },
  { id: "disaster", name: "Disaster Management", subjectId: "gs3", mode: "Mains" },
  { id: "security", name: "Internal Security", subjectId: "gs3", mode: "Mains" },
  { id: "science-tech", name: "Science & Technology", subjectId: "gs3", mode: "Both" },
  { id: "ancient-history", name: "Ancient History", subjectId: "gs1", mode: "Prelims" },
  { id: "medieval-history", name: "Medieval History", subjectId: "gs1", mode: "Prelims" },
  { id: "modern-history", name: "Modern History", subjectId: "gs1", mode: "Both" },
  { id: "post-independence", name: "Post-Independence", subjectId: "gs1", mode: "Mains" },
  { id: "world-history", name: "World History", subjectId: "gs1", mode: "Mains" },
  { id: "art-culture", name: "Art & Culture", subjectId: "gs1", mode: "Both" },
  { id: "society", name: "Indian Society", subjectId: "gs1", mode: "Mains" },
  { id: "ethics", name: "GS-IV Ethics", subjectId: "gs4", mode: "Both" },
  { id: "essay", name: "Essay", subjectId: "gs4", mode: "Mains" },
  { id: "csat", name: "CSAT", subjectId: "csat", mode: "Prelims" },
  { id: "philosophy", name: "Philosophy Optional", subjectId: "optional", mode: "Mains" },
  { id: "current-affairs", name: "Current Affairs (cross-cutting)", subjectId: "gs1", mode: "Both" },
];
