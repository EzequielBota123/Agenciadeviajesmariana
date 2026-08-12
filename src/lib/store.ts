import { db, hasDatabase } from './db';
import { newId, newToken, slugify } from './ids';
import { addDays, arToday } from './dates';
import {
  DEFAULT_PARAMS,
  fareKey,
  type FareSnapshot,
  type Quote,
  type QuoteEvent,
  type QuoteEventActor,
  type QuoteEventKind,
  type QuoteParams,
  type QuoteStatus,
  type TravelPackage,
} from './types';

// ─────────────────────────────────────────────────────────────
// Contrato del store
// ─────────────────────────────────────────────────────────────

export interface PackageInput {
  title: string;
  origin: string;
  destination: string;
  destinationName: string;
  departDate: string;
  returnDate?: string | null;
  nights?: number | null;
  board?: TravelPackage['board'];
  paxBase?: number;
  listedPriceUsd?: number | null;
  status?: TravelPackage['status'];
  notes?: string | null;
}

export interface QuoteInput {
  packageId?: string | null;
  customerName?: string | null;
  customerContact?: string | null;
  channel?: string;
  params: QuoteParams;
}

export interface EventInput {
  quoteId: string;
  kind: QuoteEventKind;
  actor: QuoteEventActor;
  text?: string | null;
  data?: Record<string, unknown> | null;
}

export type SnapshotInput = Omit<FareSnapshot, 'id' | 'deltaPct' | 'previousTotalUsd'>;

export interface Store {
  listPackages(opts?: { status?: TravelPackage['status'] }): Promise<TravelPackage[]>;
  getPackage(idOrSlug: string): Promise<TravelPackage | null>;
  createPackage(input: PackageInput): Promise<TravelPackage>;
  updatePackage(id: string, patch: Partial<PackageInput>): Promise<TravelPackage | null>;

  listQuotes(opts?: { limit?: number }): Promise<Quote[]>;
  getQuote(id: string): Promise<Quote | null>;
  getQuoteByToken(token: string): Promise<Quote | null>;
  createQuote(input: QuoteInput): Promise<Quote>;
  updateQuote(
    id: string,
    patch: { params?: QuoteParams; status?: QuoteStatus; customerName?: string | null; customerContact?: string | null },
    opts?: { bumpRevision?: boolean },
  ): Promise<Quote | null>;
  deleteQuote(id: string): Promise<boolean>;

  listEvents(quoteId: string): Promise<QuoteEvent[]>;
  addEvent(input: EventInput): Promise<QuoteEvent>;

  addSnapshot(input: SnapshotInput): Promise<FareSnapshot>;
  latestSnapshotForKey(key: {
    origin: string;
    destination: string;
    departDate: string;
    returnDate?: string | null;
    pax: number;
  }): Promise<FareSnapshot | null>;
  listSnapshots(opts: { quoteId?: string; packageId?: string; limit?: number }): Promise<FareSnapshot[]>;
}

// ─────────────────────────────────────────────────────────────
// Helpers compartidos
// ─────────────────────────────────────────────────────────────

function nowIso(): string {
  return new Date().toISOString();
}

/** Neon puede devolver `date`/`timestamptz` como Date o como string; normalizamos. */
function asIso(v: unknown): string {
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? v : new Date(t).toISOString();
  }
  return nowIso();
}

function asDateOnly(v: unknown): string {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'string') return v.slice(0, 10);
  return arToday();
}

function asDateOnlyOrNull(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  return asDateOnly(v);
}

function num(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

function numOrNull(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Calcula el movimiento porcentual contra el chequeo anterior de la misma clave. */
function computeDelta(
  input: SnapshotInput,
  previous: FareSnapshot | null,
): { deltaPct: number | null; previousTotalUsd: number | null } {
  if (!previous || previous.totalUsd <= 0) return { deltaPct: null, previousTotalUsd: null };
  const pct = ((input.totalUsd - previous.totalUsd) / previous.totalUsd) * 100;
  return {
    deltaPct: Math.round(pct * 10) / 10,
    previousTotalUsd: previous.totalUsd,
  };
}

function normalizePackage(input: PackageInput, existing?: TravelPackage): TravelPackage {
  const now = nowIso();
  return {
    id: existing?.id ?? newId(),
    slug: existing?.slug ?? (slugify(`${input.title}-${input.departDate}`) || newId().slice(0, 8)),
    title: input.title,
    origin: input.origin.toUpperCase(),
    destination: input.destination.toUpperCase(),
    destinationName: input.destinationName,
    departDate: input.departDate,
    returnDate: input.returnDate ?? null,
    nights: input.nights ?? null,
    board: input.board ?? 'all_inclusive',
    paxBase: input.paxBase ?? 2,
    listedPriceUsd: input.listedPriceUsd ?? null,
    status: input.status ?? 'borrador',
    notes: input.notes ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

// ─────────────────────────────────────────────────────────────
// Store en memoria (desarrollo y demo sin base de datos)
// ─────────────────────────────────────────────────────────────

interface MemoryState {
  packages: TravelPackage[];
  quotes: Quote[];
  events: QuoteEvent[];
  snapshots: FareSnapshot[];
}

// En dev, Next recarga los módulos en cada cambio. Guardamos el estado en
// globalThis para que los datos de prueba no se evaporen a cada rato.
const globalForMemory = globalThis as unknown as { __tarifaVivaState?: MemoryState };

function memoryState(): MemoryState {
  if (!globalForMemory.__tarifaVivaState) {
    globalForMemory.__tarifaVivaState = seed();
  }
  return globalForMemory.__tarifaVivaState;
}

function seed(): MemoryState {
  const today = arToday();
  const state: MemoryState = { packages: [], quotes: [], events: [], snapshots: [] };

  const samples: PackageInput[] = [
    {
      title: 'Cancún All Inclusive — 15 de noviembre',
      origin: 'EZE',
      destination: 'CUN',
      destinationName: 'Cancún',
      departDate: addDays(today, 97),
      returnDate: addDays(today, 104),
      nights: 7,
      board: 'all_inclusive',
      paxBase: 2,
      listedPriceUsd: 1490,
      status: 'publicado',
      notes: 'Salida grupal. Hotel 5★ frente al mar, traslados incluidos.',
    },
    {
      title: 'Bariloche fin de semana largo',
      origin: 'AEP',
      destination: 'BRC',
      destinationName: 'Bariloche',
      departDate: addDays(today, 34),
      returnDate: addDays(today, 37),
      nights: 3,
      board: 'desayuno',
      paxBase: 2,
      listedPriceUsd: 380,
      status: 'publicado',
      notes: 'Cupo limitado, hotel céntrico.',
    },
    {
      title: 'Miami — escapada de compras',
      origin: 'EZE',
      destination: 'MIA',
      destinationName: 'Miami',
      departDate: addDays(today, 61),
      returnDate: addDays(today, 68),
      nights: 7,
      board: 'solo_alojamiento',
      paxBase: 4,
      listedPriceUsd: 1180,
      status: 'borrador',
      notes: null,
    },
  ];

  for (const s of samples) state.packages.push(normalizePackage(s));

  // Una consulta de ejemplo que ya cambió dos veces, para que el panel muestre
  // de entrada el problema que el producto resuelve.
  const pkg = state.packages[0];
  const quote: Quote = {
    id: newId(),
    token: newToken(),
    packageId: pkg.id,
    customerName: 'Carolina',
    customerContact: '+54 9 11 5555-0134',
    channel: 'whatsapp',
    status: 'abierta',
    params: {
      ...DEFAULT_PARAMS,
      origin: pkg.origin,
      destination: pkg.destination,
      departDate: pkg.departDate,
      returnDate: pkg.returnDate,
      paxAdults: 2,
      timePreference: 'mañana',
    },
    revision: 2,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  state.quotes.push(quote);

  const history: Array<[QuoteEventKind, QuoteEventActor, string]> = [
    ['mensaje', 'cliente', 'Hola! quiero viajar a Cancún el 10 de marzo'],
    ['revision', 'sistema', 'Fecha actualizada: 10/03 → 15/11'],
    ['mensaje', 'cliente', 'Ah y somos 2 personas, no 1'],
    ['revision', 'sistema', 'Pasajeros: 1 → 2'],
    ['mensaje', 'cliente', 'Che, mejor el vuelo a la mañana'],
    ['revision', 'sistema', 'Preferencia horaria: indistinto → mañana'],
  ];
  for (const [kind, actor, text] of history) {
    state.events.push({
      id: newId(),
      quoteId: quote.id,
      kind,
      actor,
      text,
      data: null,
      createdAt: nowIso(),
    });
  }

  return state;
}

class MemoryStore implements Store {
  async listPackages(opts?: { status?: TravelPackage['status'] }): Promise<TravelPackage[]> {
    const all = memoryState().packages;
    const filtered = opts?.status ? all.filter((p) => p.status === opts.status) : all;
    return [...filtered].sort((a, b) => a.departDate.localeCompare(b.departDate));
  }

  async getPackage(idOrSlug: string): Promise<TravelPackage | null> {
    return memoryState().packages.find((p) => p.id === idOrSlug || p.slug === idOrSlug) ?? null;
  }

  async createPackage(input: PackageInput): Promise<TravelPackage> {
    const pkg = normalizePackage(input);
    memoryState().packages.push(pkg);
    return pkg;
  }

  async updatePackage(id: string, patch: Partial<PackageInput>): Promise<TravelPackage | null> {
    const state = memoryState();
    const i = state.packages.findIndex((p) => p.id === id);
    if (i === -1) return null;
    const merged = normalizePackage({ ...state.packages[i], ...patch } as PackageInput, state.packages[i]);
    state.packages[i] = merged;
    return merged;
  }

  async listQuotes(opts?: { limit?: number }): Promise<Quote[]> {
    return [...memoryState().quotes]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, opts?.limit ?? 200);
  }

  async getQuote(id: string): Promise<Quote | null> {
    return memoryState().quotes.find((q) => q.id === id) ?? null;
  }

  async getQuoteByToken(token: string): Promise<Quote | null> {
    return memoryState().quotes.find((q) => q.token === token) ?? null;
  }

  async createQuote(input: QuoteInput): Promise<Quote> {
    const now = nowIso();
    const quote: Quote = {
      id: newId(),
      token: newToken(),
      packageId: input.packageId ?? null,
      customerName: input.customerName ?? null,
      customerContact: input.customerContact ?? null,
      channel: input.channel ?? 'web',
      status: 'abierta',
      params: input.params,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
    memoryState().quotes.push(quote);
    return quote;
  }

  async updateQuote(
    id: string,
    patch: Parameters<Store['updateQuote']>[1],
    opts?: { bumpRevision?: boolean },
  ): Promise<Quote | null> {
    const state = memoryState();
    const i = state.quotes.findIndex((q) => q.id === id);
    if (i === -1) return null;
    const prev = state.quotes[i];
    state.quotes[i] = {
      ...prev,
      params: patch.params ?? prev.params,
      status: patch.status ?? prev.status,
      customerName: patch.customerName !== undefined ? patch.customerName : prev.customerName,
      customerContact:
        patch.customerContact !== undefined ? patch.customerContact : prev.customerContact,
      revision: opts?.bumpRevision ? prev.revision + 1 : prev.revision,
      updatedAt: nowIso(),
    };
    return state.quotes[i];
  }

  async deleteQuote(id: string): Promise<boolean> {
    const state = memoryState();
    const i = state.quotes.findIndex((q) => q.id === id);
    if (i === -1) return false;
    state.quotes.splice(i, 1);
    state.events = state.events.filter((e) => e.quoteId !== id);
    state.snapshots = state.snapshots.filter((s) => s.quoteId !== id);
    return true;
  }

  async listEvents(quoteId: string): Promise<QuoteEvent[]> {
    return memoryState()
      .events.filter((e) => e.quoteId === quoteId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async addEvent(input: EventInput): Promise<QuoteEvent> {
    const event: QuoteEvent = {
      id: newId(),
      quoteId: input.quoteId,
      kind: input.kind,
      actor: input.actor,
      text: input.text ?? null,
      data: input.data ?? null,
      createdAt: nowIso(),
    };
    memoryState().events.push(event);
    return event;
  }

  async addSnapshot(input: SnapshotInput): Promise<FareSnapshot> {
    const previous = await this.latestSnapshotForKey(input);
    const snapshot: FareSnapshot = {
      ...input,
      ...computeDelta(input, previous),
      id: newId(),
    };
    memoryState().snapshots.push(snapshot);
    return snapshot;
  }

  async latestSnapshotForKey(key: {
    origin: string;
    destination: string;
    departDate: string;
    returnDate?: string | null;
    pax: number;
  }): Promise<FareSnapshot | null> {
    const wanted = fareKey(key);
    return (
      [...memoryState().snapshots]
        .filter((s) => fareKey(s) === wanted)
        .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))[0] ?? null
    );
  }

  async listSnapshots(opts: {
    quoteId?: string;
    packageId?: string;
    limit?: number;
  }): Promise<FareSnapshot[]> {
    return [...memoryState().snapshots]
      .filter((s) => (opts.quoteId ? s.quoteId === opts.quoteId : true))
      .filter((s) => (opts.packageId ? s.packageId === opts.packageId : true))
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt))
      .slice(0, opts.limit ?? 50);
  }
}

// ─────────────────────────────────────────────────────────────
// Store sobre Postgres
// ─────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */

function rowToPackage(r: any): TravelPackage {
  return {
    id: r.id,
    slug: r.slug,
    title: r.title,
    origin: r.origin,
    destination: r.destination,
    destinationName: r.destination_name,
    departDate: asDateOnly(r.depart_date),
    returnDate: asDateOnlyOrNull(r.return_date),
    nights: numOrNull(r.nights),
    board: r.board,
    paxBase: num(r.pax_base),
    listedPriceUsd: numOrNull(r.listed_price_usd),
    status: r.status,
    notes: r.notes,
    createdAt: asIso(r.created_at),
    updatedAt: asIso(r.updated_at),
  };
}

function rowToQuote(r: any): Quote {
  return {
    id: r.id,
    token: r.token,
    packageId: r.package_id,
    customerName: r.customer_name,
    customerContact: r.customer_contact,
    channel: r.channel,
    status: r.status,
    params: typeof r.params === 'string' ? JSON.parse(r.params) : r.params,
    revision: num(r.revision),
    createdAt: asIso(r.created_at),
    updatedAt: asIso(r.updated_at),
  };
}

function rowToEvent(r: any): QuoteEvent {
  return {
    id: r.id,
    quoteId: r.quote_id,
    kind: r.kind,
    actor: r.actor,
    text: r.text,
    data: typeof r.data === 'string' ? JSON.parse(r.data) : r.data,
    createdAt: asIso(r.created_at),
  };
}

function rowToSnapshot(r: any): FareSnapshot {
  return {
    id: r.id,
    quoteId: r.quote_id,
    packageId: r.package_id,
    origin: r.origin,
    destination: r.destination,
    departDate: asDateOnly(r.depart_date),
    returnDate: asDateOnlyOrNull(r.return_date),
    pax: num(r.pax),
    provider: r.provider,
    carrier: r.carrier,
    cabin: r.cabin,
    nativeCurrency: (r.native_currency ?? 'USD') as FareSnapshot['nativeCurrency'],
    pricePerPaxNative: num(r.price_per_pax_native ?? r.price_per_pax_usd),
    totalNative: num(r.total_native ?? r.total_usd),
    pricePerPaxUsd: num(r.price_per_pax_usd),
    totalUsd: num(r.total_usd),
    exchangeRate: numOrNull(r.exchange_rate),
    seatsLeft: numOrNull(r.seats_left),
    fetchedAt: asIso(r.fetched_at),
    validUntil: asIso(r.valid_until),
    deltaPct: numOrNull(r.delta_pct),
    previousTotalUsd: numOrNull(r.previous_total_usd),
    raw: typeof r.raw === 'string' ? JSON.parse(r.raw) : r.raw,
  };
}

class PostgresStore implements Store {
  private sql = db()!;

  async listPackages(opts?: { status?: TravelPackage['status'] }): Promise<TravelPackage[]> {
    const rows = opts?.status
      ? await this.sql`select * from packages where status = ${opts.status} order by depart_date asc`
      : await this.sql`select * from packages order by depart_date asc`;
    return rows.map(rowToPackage);
  }

  async getPackage(idOrSlug: string): Promise<TravelPackage | null> {
    const rows = await this.sql`
      select * from packages where slug = ${idOrSlug} or id::text = ${idOrSlug} limit 1
    `;
    return rows[0] ? rowToPackage(rows[0]) : null;
  }

  async createPackage(input: PackageInput): Promise<TravelPackage> {
    const p = normalizePackage(input);
    await this.sql`
      insert into packages (
        id, slug, title, origin, destination, destination_name, depart_date, return_date,
        nights, board, pax_base, listed_price_usd, status, notes, created_at, updated_at
      ) values (
        ${p.id}, ${p.slug}, ${p.title}, ${p.origin}, ${p.destination}, ${p.destinationName},
        ${p.departDate}, ${p.returnDate}, ${p.nights}, ${p.board}, ${p.paxBase},
        ${p.listedPriceUsd}, ${p.status}, ${p.notes}, ${p.createdAt}, ${p.updatedAt}
      )
    `;
    return p;
  }

  async updatePackage(id: string, patch: Partial<PackageInput>): Promise<TravelPackage | null> {
    const current = await this.getPackage(id);
    if (!current) return null;
    const p = normalizePackage({ ...current, ...patch } as PackageInput, current);
    await this.sql`
      update packages set
        title = ${p.title}, origin = ${p.origin}, destination = ${p.destination},
        destination_name = ${p.destinationName}, depart_date = ${p.departDate},
        return_date = ${p.returnDate}, nights = ${p.nights}, board = ${p.board},
        pax_base = ${p.paxBase}, listed_price_usd = ${p.listedPriceUsd},
        status = ${p.status}, notes = ${p.notes}, updated_at = ${p.updatedAt}
      where id = ${p.id}
    `;
    return p;
  }

  async listQuotes(opts?: { limit?: number }): Promise<Quote[]> {
    const rows = await this.sql`
      select * from quotes order by updated_at desc limit ${opts?.limit ?? 200}
    `;
    return rows.map(rowToQuote);
  }

  async getQuote(id: string): Promise<Quote | null> {
    const rows = await this.sql`select * from quotes where id = ${id} limit 1`;
    return rows[0] ? rowToQuote(rows[0]) : null;
  }

  async getQuoteByToken(token: string): Promise<Quote | null> {
    const rows = await this.sql`select * from quotes where token = ${token} limit 1`;
    return rows[0] ? rowToQuote(rows[0]) : null;
  }

  async createQuote(input: QuoteInput): Promise<Quote> {
    const now = nowIso();
    const quote: Quote = {
      id: newId(),
      token: newToken(),
      packageId: input.packageId ?? null,
      customerName: input.customerName ?? null,
      customerContact: input.customerContact ?? null,
      channel: input.channel ?? 'web',
      status: 'abierta',
      params: input.params,
      revision: 0,
      createdAt: now,
      updatedAt: now,
    };
    await this.sql`
      insert into quotes (
        id, token, package_id, customer_name, customer_contact, channel, status,
        params, revision, created_at, updated_at
      ) values (
        ${quote.id}, ${quote.token}, ${quote.packageId}, ${quote.customerName},
        ${quote.customerContact}, ${quote.channel}, ${quote.status},
        ${JSON.stringify(quote.params)}::jsonb, ${quote.revision}, ${quote.createdAt}, ${quote.updatedAt}
      )
    `;
    return quote;
  }

  async updateQuote(
    id: string,
    patch: Parameters<Store['updateQuote']>[1],
    opts?: { bumpRevision?: boolean },
  ): Promise<Quote | null> {
    const current = await this.getQuote(id);
    if (!current) return null;
    const next: Quote = {
      ...current,
      params: patch.params ?? current.params,
      status: patch.status ?? current.status,
      customerName: patch.customerName !== undefined ? patch.customerName : current.customerName,
      customerContact:
        patch.customerContact !== undefined ? patch.customerContact : current.customerContact,
      revision: opts?.bumpRevision ? current.revision + 1 : current.revision,
      updatedAt: nowIso(),
    };
    await this.sql`
      update quotes set
        params = ${JSON.stringify(next.params)}::jsonb,
        status = ${next.status},
        customer_name = ${next.customerName},
        customer_contact = ${next.customerContact},
        revision = ${next.revision},
        updated_at = ${next.updatedAt}
      where id = ${next.id}
    `;
    return next;
  }

  async deleteQuote(id: string): Promise<boolean> {
    const rows = await this.sql`delete from quotes where id = ${id} returning id`;
    return rows.length > 0;
  }

  async listEvents(quoteId: string): Promise<QuoteEvent[]> {
    const rows = await this.sql`
      select * from quote_events where quote_id = ${quoteId} order by created_at asc
    `;
    return rows.map(rowToEvent);
  }

  async addEvent(input: EventInput): Promise<QuoteEvent> {
    const event: QuoteEvent = {
      id: newId(),
      quoteId: input.quoteId,
      kind: input.kind,
      actor: input.actor,
      text: input.text ?? null,
      data: input.data ?? null,
      createdAt: nowIso(),
    };
    await this.sql`
      insert into quote_events (id, quote_id, kind, actor, text, data, created_at)
      values (
        ${event.id}, ${event.quoteId}, ${event.kind}, ${event.actor}, ${event.text},
        ${event.data ? JSON.stringify(event.data) : null}::jsonb, ${event.createdAt}
      )
    `;
    return event;
  }

  async addSnapshot(input: SnapshotInput): Promise<FareSnapshot> {
    const previous = await this.latestSnapshotForKey(input);
    const snapshot: FareSnapshot = { ...input, ...computeDelta(input, previous), id: newId() };
    await this.sql`
      insert into fare_snapshots (
        id, quote_id, package_id, origin, destination, depart_date, return_date, pax,
        provider, carrier, cabin, native_currency, price_per_pax_native, total_native,
        price_per_pax_usd, total_usd, exchange_rate, seats_left,
        fetched_at, valid_until, delta_pct, previous_total_usd, raw
      ) values (
        ${snapshot.id}, ${snapshot.quoteId}, ${snapshot.packageId}, ${snapshot.origin},
        ${snapshot.destination}, ${snapshot.departDate}, ${snapshot.returnDate}, ${snapshot.pax},
        ${snapshot.provider}, ${snapshot.carrier}, ${snapshot.cabin}, ${snapshot.nativeCurrency},
        ${snapshot.pricePerPaxNative}, ${snapshot.totalNative}, ${snapshot.pricePerPaxUsd},
        ${snapshot.totalUsd}, ${snapshot.exchangeRate}, ${snapshot.seatsLeft},
        ${snapshot.fetchedAt}, ${snapshot.validUntil},
        ${snapshot.deltaPct}, ${snapshot.previousTotalUsd},
        ${snapshot.raw ? JSON.stringify(snapshot.raw) : null}::jsonb
      )
    `;
    return snapshot;
  }

  async latestSnapshotForKey(key: {
    origin: string;
    destination: string;
    departDate: string;
    returnDate?: string | null;
    pax: number;
  }): Promise<FareSnapshot | null> {
    const rows = await this.sql`
      select * from fare_snapshots
      where origin = ${key.origin}
        and destination = ${key.destination}
        and depart_date = ${key.departDate}
        and return_date is not distinct from ${key.returnDate ?? null}
        and pax = ${key.pax}
      order by fetched_at desc
      limit 1
    `;
    return rows[0] ? rowToSnapshot(rows[0]) : null;
  }

  async listSnapshots(opts: {
    quoteId?: string;
    packageId?: string;
    limit?: number;
  }): Promise<FareSnapshot[]> {
    const limit = opts.limit ?? 50;
    if (opts.quoteId) {
      const rows = await this.sql`
        select * from fare_snapshots where quote_id = ${opts.quoteId}
        order by fetched_at desc limit ${limit}
      `;
      return rows.map(rowToSnapshot);
    }
    if (opts.packageId) {
      const rows = await this.sql`
        select * from fare_snapshots where package_id = ${opts.packageId}
        order by fetched_at desc limit ${limit}
      `;
      return rows.map(rowToSnapshot);
    }
    const rows = await this.sql`
      select * from fare_snapshots order by fetched_at desc limit ${limit}
    `;
    return rows.map(rowToSnapshot);
  }
}

/* eslint-enable @typescript-eslint/no-explicit-any */

let instance: Store | null = null;

export function store(): Store {
  if (!instance) instance = hasDatabase() ? new PostgresStore() : new MemoryStore();
  return instance;
}

export function storageMode(): 'postgres' | 'memoria' {
  return hasDatabase() ? 'postgres' : 'memoria';
}
