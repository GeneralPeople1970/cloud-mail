import { describe, expect, it } from 'vitest';
import attService from '../src/service/att-service';

const key = 'attachments/photo.png';
const origin = 'https://mail.example.test';
const cdn = 'https://cdn.example.test';

describe('inline attachments in replies', () => {
	it.each([key, `/${key}`, `../${key}`, `../../${key}`, `${origin}/${key}?v=2`, `${cdn}/${key}`])(
		'resolves the local storage key for %s', src => {
			expect(attService.fromAttSrc(src, cdn, origin)).toBe(key);
		},
	);

	it('keeps remote images and proxy links out of attachment lookup', () => {
		expect(attService.fromAttSrc(`https://images.example.test/${key}`, cdn, origin)).toBeNull();
		expect(attService.fromAttSrc(`/proxy?url=https://images.example.test/${key}`, cdn, origin)).toBeNull();
	});
});
