import { init, register } from 'svelte-i18n';

export const defaultLocale = 'en';
export const supportedLocales = ['en', 'ru'] as const;

// Register locales with lazy loading
supportedLocales.forEach(locale => {
	register(locale, () => import(`./locales/${locale}.json`));
});

// Initialize i18n with given locale
export async function setupI18n(locale?: string) {
	const initialLocale = locale || defaultLocale;

	try {
		await init({
			fallbackLocale: defaultLocale,
			initialLocale
		});
	} catch (error) {
		console.error('[I18N] Error during init:', error);
		throw error;
	}
}

// Re-export for convenience
export { _, locale as localeStore, locales } from 'svelte-i18n';
