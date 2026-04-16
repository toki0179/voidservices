import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');
const boostTemplatePath = path.join(projectRoot, 'assets', 'templates', 'testingboost.html');
const whitneyFontPath = path.join(projectRoot, 'assets', 'fonts', 'Whitneyfont.woff');
const boostImagePath = path.join(projectRoot, 'assets', 'templates', 'image.jpg');
const defaultBoostImageUrl = 'https://cdn.discordapp.com/attachments/782434583974248511/793316025244057630/nitroregular.png';

function formatAMPM(date) {
	let hour = date.getHours();
	const minute = date.getMinutes();
	const period = hour >= 12 ? 'PM' : 'AM';

	hour %= 12;
	hour = hour || 12;

	return `${hour}:${String(minute).padStart(2, '0')} ${period}`;
}

function escapeHtml(input) {
	return String(input)
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;')
		.replaceAll("'", '&#039;');
}

function generateGiftCode(length = 16) {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let code = '';

	for (let index = 0; index < length; index += 1) {
		code += alphabet[randomInt(alphabet.length)];
	}

	return code;
}

async function screenshotHtml(html, options = {}) {
	const {
		selector = 'body',
		viewport = { width: 1000, height: 620, deviceScaleFactor: 2 },
		waitForSelector,
	} = options;

	const browser = await puppeteer.launch({
		args: ['--no-sandbox', '--disable-setuid-sandbox'],
	});

	try {
		const page = await browser.newPage();
		await page.setViewport(viewport);
		await page.setContent(html, { waitUntil: 'networkidle0' });

		// Ensure custom fonts are fully loaded before rasterizing text.
		await page.evaluate(async () => {
			if (document.fonts?.ready) {
				await document.fonts.ready;
			}

			const imagePromises = Array.from(document.images, (img) => {
				if (img.complete) {
					return Promise.resolve();
				}

				if (typeof img.decode === 'function') {
					return img.decode().catch(() => {});
				}

				return new Promise((resolve) => {
					img.addEventListener('load', resolve, { once: true });
					img.addEventListener('error', resolve, { once: true });
				});
			});

			await Promise.all(imagePromises);
		});

		if (waitForSelector) {
			await page.waitForSelector(waitForSelector);
		}

		const element = await page.$(selector);

		if (!element) {
			throw new Error(`Could not find screenshot selector: ${selector}`);
		}

		return await element.screenshot({ type: 'png' });
	} finally {
		await browser.close();
	}
}

export async function renderNitroProofCard({
	firstAuthorName,
	firstAuthorAvatarUrl,
	secondAuthorName,
	secondAuthorAvatarUrl,
	responseText,
}) {
	const now = new Date();
	const oneMinuteAgo = new Date(Date.now() - 60_000);
	const giftCode = generateGiftCode(16);
	const giftUrl = `https://discord.gift/${giftCode}`;
	const fontUrl = pathToFileURL(whitneyFontPath).href;
	const imageDataUrl = `data:image/jpeg;base64,${(await readFile(boostImagePath)).toString('base64')}`;

	const rawTemplate = await readFile(boostTemplatePath, 'utf8');

	const html = rawTemplate
		.replaceAll('http://localhost:3000/font', fontUrl)
		.replaceAll(defaultBoostImageUrl, imageDataUrl)
		.replaceAll('templates/image.jpg', imageDataUrl)
		.replaceAll('templates/image.png', imageDataUrl)
		.replace(/src="[^"]*nitroregular\.(png|jpg|jpeg)"/, `src="${imageDataUrl}"`)
		.replace(/title="https:\/\/discord\.gift\/[^"]*"/, `title="${giftUrl}"`)
		.replace(/href="https:\/\/discord\.gift\/[^"]*"/, `href="${giftUrl}"`)
		.replace(/href="https:\/\/google\.com"/, `href="${giftUrl}"`)
		.replace(/(text-shadow: 0 0 5px var\(--text-link\);" href="[^"]*">)[^<]*(<\/a>)/, `$1${giftCode}$2`)
		.replace('FIRSTAUTHORURL', firstAuthorAvatarUrl)
		.replace('THEFIRSTAUTHOR', escapeHtml(firstAuthorName))
		.replace('SECONDAUTHORURL', secondAuthorAvatarUrl)
		.replace('THESECONDAUTHOR', escapeHtml(secondAuthorName))
		.replace('RESPONSETONITRO', escapeHtml(responseText))
		.replace('FIRSTAUTHORDATE', `Today at ${formatAMPM(oneMinuteAgo)}`)
		.replace('SECONDAUTHORDATE', `Today at ${formatAMPM(now)}`);

	const imageBuffer = await screenshotHtml(html, {
		selector: '.scrollerInner-2YIMLh',
		viewport: { width: 980, height: 760, deviceScaleFactor: 2 },
		waitForSelector: '.scrollerInner-2YIMLh',
	});

	return imageBuffer;
}

export async function renderParodyCard({ plan, name, detail, note }) {
	const safePlan = escapeHtml(plan);
	const safeName = escapeHtml(name);
	const safeDetail = escapeHtml(detail);
	const safeNote = escapeHtml(note);
	const fontUrl = pathToFileURL(whitneyFontPath).href;

	const html = `<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1" />
		<style>
			@font-face {
				font-family: 'Whitney';
				src: url('${fontUrl}') format('woff');
			}

			:root {
				--bg-1: #0f1218;
				--bg-2: #1a1f29;
				--line: rgba(255, 255, 255, 0.08);
				--text-main: #f8fafc;
				--text-soft: #c9d1d9;
				--accent: #3ba55c;
			}

			* {
				box-sizing: border-box;
			}

			body {
				margin: 0;
				padding: 24px;
				width: 960px;
				height: 540px;
				font-family: Whitney, 'Helvetica Neue', Helvetica, Arial, sans-serif;
				background:
					radial-gradient(circle at 20% 0%, rgba(59, 165, 92, 0.2) 0%, transparent 50%),
					linear-gradient(145deg, var(--bg-1), var(--bg-2));
				color: var(--text-main);
			}

			.card {
				height: 100%;
				border: 1px solid var(--line);
				border-radius: 18px;
				background: rgba(10, 13, 18, 0.72);
				box-shadow: 0 24px 80px rgba(0, 0, 0, 0.45);
				padding: 28px;
				display: grid;
				grid-template-rows: auto 1fr auto;
				gap: 22px;
			}

			.top {
				display: flex;
				justify-content: space-between;
				align-items: baseline;
			}

			.badge {
				display: inline-flex;
				align-items: center;
				gap: 10px;
				padding: 8px 12px;
				border-radius: 999px;
				border: 1px solid rgba(59, 165, 92, 0.4);
				color: #d2f8df;
				background: rgba(59, 165, 92, 0.12);
				font-size: 18px;
				letter-spacing: 0.2px;
			}

			.dot {
				width: 9px;
				height: 9px;
				border-radius: 50%;
				background: var(--accent);
			}

			.label {
				font-size: 15px;
				color: var(--text-soft);
			}

			.main {
				border: 1px solid var(--line);
				border-radius: 14px;
				padding: 24px;
				display: grid;
				gap: 14px;
			}

			.plan {
				font-size: 34px;
				font-weight: 700;
			}

			.name {
				font-size: 26px;
				font-weight: 600;
			}

			.detail {
				font-size: 19px;
				color: var(--text-soft);
			}

			.footer {
				display: grid;
				gap: 8px;
			}

			.fictional {
				font-size: 16px;
				color: #fca5a5;
			}

			.note {
				font-size: 16px;
				color: var(--text-soft);
			}
		</style>
	</head>
	<body>
		<main class="card">
			<div class="top">
				<div class="badge"><span class="dot"></span> Parody Card</div>
				<div class="label">V0iD Module • Slash command render</div>
			</div>
			<section class="main">
				<div class="plan">${safePlan}</div>
				<div class="name">${safeName}</div>
				<div class="detail">${safeDetail}</div>
			</section>
			<footer class="footer">
				<div class="fictional">This image is fictional and not valid proof of purchase.</div>
				<div class="note">${safeNote}</div>
			</footer>
		</main>
	</body>
</html>`;

	const imageBuffer = await screenshotHtml(html, {
		selector: '.card',
		viewport: { width: 1008, height: 588, deviceScaleFactor: 2 },
		waitForSelector: '.card',
	});

	return imageBuffer;
}
