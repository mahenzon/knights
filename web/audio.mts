const tracks = {
  menu: 'knights_gameplay_02.mp3',
  game: 'knights_gameplay_03.mp3',
};

// Reuse one gesture-authorized media element; streaming avoids decoding the whole OST into RAM.
type TrackGroup = keyof typeof tracks;

export class Soundtrack {
  audio: HTMLAudioElement;
  onBlocked: (reason: 'blocked' | 'unavailable') => void;
  group: TrackGroup | null;
  wanted: boolean;
  epoch: number;
  name?: string;
  resumeAt?: number;
  retryTimer?: ReturnType<typeof setTimeout>;
  retries = 0;
  downloads = new Map<string, Promise<void>>();
  sources = new Map<string, string>();
  remainingLoops = 100;
  finished = false;
  constructor(
    audio: HTMLAudioElement,
    onBlocked: (reason: 'blocked' | 'unavailable') => void = () => {},
  ) {
    this.audio = audio;
    this.onBlocked = onBlocked;
    this.group = null;
    this.wanted = false;
    this.epoch = 0;
    audio.volume = 0.5;
    audio.preload = 'auto';
    audio.muted = true;
    audio.addEventListener('error', () => this.failed(this.epoch));
    audio.addEventListener('playing', () => {
      // OS media controls can bypass play(); preserve background/mute intent.
      if (!this.wanted) audio.pause();
      this.retries = 0;
    });
    audio.addEventListener('ended', () => {
      if (!this.wanted || !this.group) return;
      if (this.remainingLoops === 0) {
        this.finished = true;
        this.wanted = false;
        return;
      }
      this.remainingLoops--;
      audio.currentTime = 0;
      this.play(this.group);
    });
  }
  async preload(group: TrackGroup) {
    const name = tracks[group];
    let pending = this.downloads.get(name);
    if (!pending) {
      pending = (async () => {
        try {
          const response = await fetch(`./assets/${name}`);
          if (!response.ok) throw Error('Soundtrack download failed');
          const blob = await response.blob();
          if (!blob.size) throw Error('Empty soundtrack');
          // Keep compressed bytes, not minutes of decoded PCM, ready for offline playback.
          this.sources.set(name, URL.createObjectURL(blob));
        } catch (error) {
          this.downloads.delete(name);
          throw error;
        }
      })();
      this.downloads.set(name, pending);
    }
    await pending;
  }
  async ready(group: TrackGroup) {
    await this.preload(group);
    if (this.wanted && this.group === group && !(await this.play(group)))
      throw Error('Soundtrack playback could not start');
  }
  play(group: TrackGroup) {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    if (this.group !== group) {
      this.retries = 0;
      this.remainingLoops = 100;
      this.finished = false;
    } else if (this.finished) return Promise.resolve(true);
    this.group = group;
    this.wanted = true;
    const epoch = ++this.epoch,
      name = tracks[group],
      source = this.sources.get(name) ?? `./assets/${name}`,
      replaceSource = !this.audio.src || (this.sources.has(name) && this.audio.src !== source);
    // Failed HTTP responses before metadata are code 4 in Chromium, not code 2.
    const retryNetwork = Boolean(this.audio.error);
    const resumeAt = this.name === name ? (this.resumeAt ?? this.audio.currentTime) : 0;
    if (this.name !== name || retryNetwork || replaceSource) {
      this.name = name;
      this.resumeAt = resumeAt;
      if (
        this.audio.src !== source &&
        !(!this.sources.has(name) && this.audio.src.endsWith(`/assets/${name}`))
      )
        this.audio.src = source;
      this.audio.loop = false;
      this.audio.onloadedmetadata = () => {
        if (!this.wanted || this.name !== name) return;
        if (resumeAt > 0) this.audio.currentTime = resumeAt;
        this.resumeAt = undefined;
      };
      // play() alone cannot clear a failed media download after a tunnel/network interruption.
      if (retryNetwork) this.audio.load();
    }
    // Must be called synchronously from the tap, before any image/network awaits.
    try {
      this.audio.muted = false;
      return Promise.resolve(this.audio.play()).then(
        () => {
          if (!this.wanted) this.audio.pause();
          return true;
        },
        () => {
          this.failed(epoch);
          return false;
        },
      );
    } catch {
      this.failed(epoch);
      return Promise.resolve(false);
    }
  }
  private failed(epoch: number) {
    if (!this.wanted || epoch !== this.epoch) return;
    if (!this.audio.error) {
      this.onBlocked('blocked');
    } else if (this.retryTimer === undefined) {
      if (this.retries >= 3) this.onBlocked('unavailable');
      else
        this.retryTimer = setTimeout(
          () => {
            if (this.wanted && this.group) this.play(this.group);
          },
          500 * 2 ** this.retries++,
        );
    }
  }
  pause() {
    this.wanted = false;
    this.epoch++;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.audio.muted = true;
    this.audio.pause();
    if (this.audio.src) {
      this.resumeAt ??= this.audio.currentTime;
      this.audio.onloadedmetadata = null;
      // Release Android's resumable player as well as stopping audible playback.
      this.audio.removeAttribute('src');
      this.audio.load();
    }
  }
}
