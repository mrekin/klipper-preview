import { locale } from 'svelte-i18n';
import { get } from 'svelte/store';
import enMessages from './locales/en.json';
import ruMessages from './locales/ru.json';

/**
 * Duration parts interface
 */
export interface DurationParts {
	hours: number;
	minutes: number;
	seconds: number;
}

/**
 * Time remaining parts interface
 */
export interface TimeRemainingParts {
	hours: number;
	minutes: number;
	expired: boolean;
}

/**
 * ETA parts interface
 */
export interface ETAParts {
	hours: number;
	minutes: number;
	valid: boolean;
}

/**
 * Messages interface for formatters
 */
export interface FormattersMessages {
	h: string;
	m: string;
	s: string;
	etaPrefix: string;
	expired: string;
	ttl: {
		minutes: string;
		hour: string;
		hoursPlural: string;
		hoursMany?: string;
		custom: string;
	};
}

/**
 * Default formatters messages (fallback)
 */
const defaultFormatters: FormattersMessages = {
	h: 'h',
	m: 'min',
	s: 's',
	etaPrefix: 'Remaining',
	expired: 'Expired',
	ttl: {
		minutes: 'min',
		hour: '1 hour',
		hoursPlural: 'hours',
		custom: 'Custom time (min)'
	}
};

/**
 * Get formatters messages for a given locale
 * @param localeStr - Locale string (e.g., 'en', 'ru')
 * @returns Formatters messages object
 */
function getFormattersMessages(localeStr: string): FormattersMessages {
	const messages = localeStr === 'ru' ? ruMessages : enMessages;
	return (messages.formatters as FormattersMessages) || defaultFormatters;
}

/**
 * Format duration into numeric parts
 * @param seconds - Duration in seconds
 * @returns Duration parts with hours, minutes, seconds
 */
export function formatDurationParts(seconds: number): DurationParts {
	return {
		hours: Math.floor(seconds / 3600),
		minutes: Math.floor((seconds % 3600) / 60),
		seconds: Math.floor(seconds % 60)
	};
}

/**
 * Format remaining time into numeric parts
 * @param expiresAt - Expiration timestamp
 * @returns Time remaining parts with hours, minutes, and expired flag
 */
export function formatTimeRemainingParts(expiresAt: number): TimeRemainingParts {
	const remaining = expiresAt - Date.now();
	if (remaining <= 0) {
		return { hours: 0, minutes: 0, expired: true };
	}

	return {
		hours: Math.floor(remaining / (1000 * 60 * 60)),
		minutes: Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60)),
		expired: false
	};
}

/**
 * Format ETA into numeric parts
 * @param seconds - ETA in seconds
 * @returns ETA parts with hours, minutes, and valid flag
 */
export function formatETAParts(seconds: number): ETAParts {
	if (seconds <= 0) {
		return { hours: 0, minutes: 0, valid: false };
	}

	return {
		hours: Math.floor(seconds / 3600),
		minutes: Math.floor((seconds % 3600) / 60),
		valid: true
	};
}

/**
 * Format date with locale support
 * @param timestamp - Date timestamp
 * @returns Formatted date string
 */
export function formatDate(timestamp: number): string {
	const currentLocale = get(locale) || 'en';
	const localeStr = currentLocale === 'ru' ? 'ru-RU' : 'en-US';
	return new Date(timestamp).toLocaleString(localeStr);
}

/**
 * Format duration into a localized string
 * @param seconds - Duration in seconds
 * @param localeStr - Locale string (e.g., 'en', 'ru')
 * @returns Formatted duration string
 */
export function formatDuration(seconds: number, localeStr: string): string {
	const msgs = getFormattersMessages(localeStr);
	const parts: DurationParts = formatDurationParts(seconds);
	let result = '';

	if (parts.hours > 0) {
		result += `${parts.hours}${msgs.h} `;
	}

	result += `${parts.minutes}${msgs.m}`;

	if (parts.seconds > 0 || parts.hours === 0) {
		result += ` ${parts.seconds}${msgs.s}`;
	}

	return result.trim();
}

/**
 * Format ETA into a localized string
 * @param seconds - ETA in seconds
 * @param localeStr - Locale string (e.g., 'en', 'ru')
 * @returns Formatted ETA string
 */
export function formatETA(seconds: number, localeStr: string): string {
	const msgs = getFormattersMessages(localeStr);
	const parts: ETAParts = formatETAParts(seconds);
	if (!parts.valid) return '—';

	if (parts.hours > 0) {
		return `${msgs.etaPrefix} ${parts.hours}${msgs.h} ${parts.minutes}${msgs.m}`;
	}
	return `${msgs.etaPrefix} ${parts.minutes}${msgs.m}`;
}

/**
 * Format time remaining into a localized string
 * @param expiresAt - Expiration timestamp
 * @param localeStr - Locale string (e.g., 'en', 'ru')
 * @returns Formatted time remaining string
 */
export function formatTimeRemaining(expiresAt: number, localeStr: string): string {
	const msgs = getFormattersMessages(localeStr);
	const parts: TimeRemainingParts = formatTimeRemainingParts(expiresAt);
	if (parts.expired) {
		return msgs.expired;
	}

	if (parts.hours > 0) {
		return `${parts.hours}${msgs.h} ${parts.minutes}${msgs.m}`;
	}
	return `${parts.minutes}${msgs.m}`;
}

/**
 * Get TTL label for a given number of minutes
 * @param minutes - Time to live in minutes
 * @param localeStr - Locale string (e.g., 'en', 'ru')
 * @returns Formatted TTL label string
 */
export function getTTLLabel(minutes: number, localeStr: string): string {
	const msgs = getFormattersMessages(localeStr);
	const h = minutes / 60;

	if (minutes < 60) {
		return `${minutes} ${msgs.ttl.minutes}`;
	}

	if (h === 1) {
		return msgs.ttl.hour;
	}

	if (h === 1.5) {
		return `1.5 ${msgs.ttl.hoursPlural}`;
	}

	return `${h} ${msgs.ttl.hoursPlural}`;
}
