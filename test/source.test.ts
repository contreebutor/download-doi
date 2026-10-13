import { describe, expect, it } from 'vitest';
import { createSource, DoiSource, PmidSource, TitleSource } from '../src/core/source.js';
import { EmptyDoiError, EmptyPmidError, EmptyTitleError } from '../src/errors.js';

describe('DoiSource', () => {
  it('strips the protocol from a doi url', () => {
    const source = new DoiSource('https://doi.org/10.1145/3375633');
    expect(source.doi).toBe('doi.org/10.1145/3375633');
    expect(source.protocol).toBe('https');
    expect(source.type).toBe('doi');
  });

  it('keeps a bare doi untouched and defaults the protocol', () => {
    const source = new DoiSource('10.1145/3375633');
    expect(source.doi).toBe('10.1145/3375633');
    expect(source.protocol).toBe('https');
  });

  it('reads an http doi url', () => {
    expect(new DoiSource('http://doi.org/10.1145/3375633').protocol).toBe('http');
  });

  it('rejects an empty doi', () => {
    expect(() => new DoiSource('')).toThrow(EmptyDoiError);
    expect(() => new DoiSource(undefined as unknown as string)).toThrow(EmptyDoiError);
  });

  it('rejects a non-string doi', () => {
    expect(() => new DoiSource(123 as unknown as string)).toThrow(TypeError);
  });
});

describe('PmidSource', () => {
  it('accepts numbers and strings', () => {
    expect(new PmidSource(31395057).pmid).toBe('31395057');
    expect(new PmidSource('31395057').pmid).toBe('31395057');
  });

  it('rejects empty and non-scalar pmids', () => {
    expect(() => new PmidSource('')).toThrow(EmptyPmidError);
    expect(() => new PmidSource({} as unknown as string)).toThrow(TypeError);
  });
});

describe('TitleSource', () => {
  it('trims the title', () => {
    expect(new TitleSource('  Attention Is All You Need  ').title).toBe('Attention Is All You Need');
  });

  it('rejects a blank title', () => {
    expect(() => new TitleSource('   ')).toThrow(EmptyTitleError);
  });
});

describe('createSource', () => {
  it('builds the source matching the type, case-insensitively', () => {
    expect(createSource('10.1145/3375633', 'DOI')).toBeInstanceOf(DoiSource);
    expect(createSource('31395057', 'pmid')).toBeInstanceOf(PmidSource);
    expect(createSource('Some Paper', 'TITLE')).toBeInstanceOf(TitleSource);
  });

  it('falls back to doi for an unknown type', () => {
    expect(createSource('10.1145/3375633', 'nope')).toBeInstanceOf(DoiSource);
  });
});
