from probe_full_days import FullDayProbe

class Debug(FullDayProbe):
    def __init__(self):
        self.ticks = 0
        self.previous = None
        super().__init__()
    def call(self, address, args, stack=()):
        super().call(address, args, stack)
        if address == 0x20728:
            self.ticks += 1
            if self.ticks >= 2350:
                a = self.actor_state(6)
                keys = ['kind','flying','pose','ability_active','ability_done','ability_delay','ability_remaining','vx','vy']
                stamp = [a[k] for k in keys[:5]]
                if stamp != self.previous or self.ticks >= 2444:
                    print(self.ticks, {k:a[k] for k in keys}, flush=True)
                self.previous = stamp
            if self.ticks == 2446:
                self.switched = True

Debug().run('campaign',4,True,1,12)
