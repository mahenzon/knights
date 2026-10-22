//! Native PlaySound(event, subtype) requests, in call order; playback is a browser concern.
#[derive(Clone, Default)]
pub(super) struct SoundQueue {
    pub events: Vec<u32>,
    frame_end: usize,
}
impl SoundQueue {
    pub fn emit(&mut self, event: u32, subtype: u32) {
        self.events.push(event * 30 + subtype);
    }
    pub fn weapon(&mut self, bit: u32) {
        let (event, subtype) = [
            (16, 0),
            (18, 0),
            (17, 0),
            (4, 4),
            (12, 0),
            (16, 1),
            (13, 0),
            (14, 0),
            (16, 1),
        ][bit as usize];
        self.emit(event, subtype);
    }
    pub fn begin_frame(&mut self) {
        // Discard unconsumed old frames, but retain input events received since the last step.
        self.events.drain(..self.frame_end);
        self.frame_end = 0;
    }
    pub fn finish_frame(&mut self) {
        self.frame_end = self.events.len();
    }
    pub fn clear(&mut self) {
        self.events.clear();
        self.frame_end = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn repeated_events_and_between_frame_input_keep_native_order() {
        let mut q = SoundQueue::default();
        q.emit(3, 0);
        q.begin_frame();
        q.emit(1, 4);
        q.emit(15, 0);
        q.emit(15, 0);
        q.finish_frame();
        assert_eq!(q.events, [90, 34, 450, 450]);
        q.emit(2, 0);
        q.begin_frame();
        q.weapon(6);
        q.finish_frame();
        assert_eq!(q.events, [60, 390]);
        q.clear();
        q.begin_frame();
        assert!(q.events.is_empty());
    }

    #[test]
    fn unconsumed_frames_do_not_accumulate() {
        let mut q = SoundQueue::default();
        for _ in 0..10000 {
            q.begin_frame();
            for _ in 0..200 {
                q.emit(1, 0);
            }
            q.finish_frame();
            assert_eq!(q.events.len(), 200);
        }
        assert!(q.events.capacity() < 512);
    }
}
