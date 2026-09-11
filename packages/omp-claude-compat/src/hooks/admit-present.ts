import { type AdmitCommand, AdmitHooksCommand } from './admit-loaded-settings.workflow.js'

export const admitPresent = (present: boolean): AdmitCommand => new AdmitHooksCommand({ present })
