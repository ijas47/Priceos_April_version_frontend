export type ContentChannel = "airbnb" | "booking_com" | "vrbo" | "all";

export type ContentField =
  | "title"
  | "summary"
  | "description"
  | "headline";

export type ContentProposalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "pushed"
  | "verified"
  | "failed";

export type ContentRisk = "low" | "medium" | "high";

export interface ChannelContent {
  title?: string;
  summary?: string;
  description?: string;
  headline?: string;
  listingUrl?: string;
}

export interface ListingContentChannels {
  airbnb: ChannelContent;
  booking_com: ChannelContent;
  vrbo: ChannelContent;
}

export interface ListingContentShared {
  description: string;
  amenities: string[];
  personCapacity?: number;
  bedroomsNumber?: number;
  averageReviewRating?: number;
}

export interface VisibilityAudit {
  overall: number;
  byChannel: Partial<Record<ContentChannel, number>>;
}

export interface OptimizerProposalDraft {
  channel: ContentChannel;
  field: ContentField;
  current: string;
  proposed: string;
  reasoning: string;
  visibilityDelta: number;
  risk: ContentRisk;
}

export interface OptimizerResult {
  audit: VisibilityAudit;
  proposals: OptimizerProposalDraft[];
  source: "lyzr" | "rules";
}