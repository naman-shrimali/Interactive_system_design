---
version: 1
---

The first structural change is separating the thing that serves requests from the thing that stores data. Everything afterwards depends on it.

### Why the split comes first

On a single box, the web app and the database fight over the same memory, CPU and disk. Worse, they want *different* hardware: the app tier wants many cores and network capacity, the database wants memory and fast storage. One machine cannot be optimal for both.

Separating them lets each scale on its own axis, and it's the precondition for everything else — you cannot put a load balancer in front of a tier that is also your database.

### Stateless is the requirement, not a nicety

Once you have more than one web server, a request can land on any of them. If server 1 holds a user's session in memory and their next request lands on server 2, they're logged out.

The two ways out:

- **Sticky sessions** pin a user to a server. This works and quietly reintroduces every problem you were solving: uneven load, sessions lost when a server dies, and disruptive deploys.
- **Externalise the state** into a shared store — Redis, or a signed token held by the client. Any server can serve any request, and the tier becomes genuinely disposable.

The second is the answer. **"Stateless web tier" specifically means session state lives somewhere both servers can reach**, and it's what makes autoscaling and rolling deploys possible.

### Replication and the lag it introduces

Reads usually outnumber writes heavily, so the standard next move is a primary that takes writes and replicas that serve reads. Read capacity then scales by adding replicas.

The cost is replication lag. A replica is behind the primary by milliseconds normally, and much longer under load or during a large write. So:

- A user updates their profile, the write goes to the primary, their next read hits a replica, and they see the old value. This is the single most common user-visible consistency bug, and it's a design consequence rather than a defect.
- The standard fix is **read-your-own-writes**: route a user's reads to the primary for a short window after they write, or pass a version token that ensures they read from a replica that has caught up.

Failover has a matching subtlety: promoting a replica when the primary dies is straightforward; ensuring the promoted replica had all the writes, and that the old primary doesn't come back believing it's still in charge, is not. That's what fencing and leader election exist for.

### What breaks next

With a load-balanced stateless tier and read replicas, the next bottleneck is usually the database being asked the same questions repeatedly — which is the cache's cue — followed by static assets travelling further than they need to, which is the CDN's.
