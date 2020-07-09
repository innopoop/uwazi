import mongoose from 'mongoose';
import { instanceModel } from 'api/odm';

const languagesSchema = new mongoose.Schema({
  key: String,
  label: String,
  rtl: Boolean,
  default: Boolean,
});

const linksSchema = new mongoose.Schema({
  title: String,
  url: String,
});

const filtersSchema = new mongoose.Schema({
  id: String,
  name: String,
  items: mongoose.Schema.Types.Mixed,
});

const featuresSchema = new mongoose.Schema({
  semanticSearch: Boolean,
  favorites: Boolean,
});

const settingsSchema = new mongoose.Schema({
  project: String,
  site_name: String,
  contactEmail: String,
  publicFormDestination: { type: String, select: false },
  allowedPublicTemplates: [{ type: String }],
  home_page: String,
  private: Boolean,
  cookiepolicy: Boolean,
  languages: [languagesSchema],
  links: [linksSchema],
  filters: [filtersSchema],
  mailerConfig: String,
  analyticsTrackingId: String,
  matomoConfig: String,
  dateFormat: String,
  newNameGeneration: Boolean,
  features: featuresSchema,
  custom: mongoose.Schema.Types.Mixed,
  sync: { type: mongoose.Schema.Types.Mixed, select: false },
  evidencesVault: mongoose.Schema.Types.Mixed,
  customCSS: String,
  mapTilerKey: String,
});

export default instanceModel('settings', settingsSchema);
