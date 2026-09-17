import type { AgainstId, RangeId } from "./constants";

export type CrimeQuery = {
  range: RangeId;
  against: AgainstId;
  group: string;
};

export type NamedCount = {
  name: string;
  n: number;
};

export type ZipStat = {
  zip: string;
  n: number;
  prev: number;
  cfs: number;
  person: number;
  property: number;
  society: number;
};

export type DailyPoint = {
  date: string;
  n: number;
};

export type HourPoint = {
  hour: number;
  n: number;
};

export type DowPoint = {
  day: string;
  n: number;
};

export type CrimeSnapshot = {
  asOf: string;
  from: string;
  to: string;
  prevFrom: string;
  prevTo: string;
  lastModified: string | null;
  total: number;
  previousTotal: number;
  cfsTotal: number;
  zips: ZipStat[];
  groups: NamedCount[];
  against: NamedCount[];
  areas: NamedCount[];
  daily: DailyPoint[];
  topCodes: NamedCount[];
  hours: HourPoint[];
  weekdays: DowPoint[];
};

export type DemandStats = {
  cfsTotal: number;
  byZip: { zip: string; n: number }[];
  hours: HourPoint[];
  weekdays: DowPoint[];
};

export type ZipDetail = {
  zip: string;
  groups: NamedCount[];
  codes: NamedCount[];
  areas: NamedCount[];
  cfs: number;
  hours: HourPoint[];
  weekdays: DowPoint[];
};

export type OffenseReport = {
  id: string;
  reportDate: string;
  dateTime: string;
  codeName: string;
  against: string;
  group: string;
  area: string;
  zip: string;
};

export type OffenseList = {
  reports: OffenseReport[];
  names: NamedCount[];
  matched: number;
};

export type ZipProps = {
  ZIP: string;
  PO_NAME: string;
  SQMI: number;
  Lng: string | number;
  Lat: string | number;
  MedianIncome: number | null;
  TotalHouseholds: number | null;
};

export type AreaProps = {
  SUBSTN: string;
  SqMiles: number;
};

export type Geography = "zip" | "area";
export type Metric = "count" | "density" | "spike";
