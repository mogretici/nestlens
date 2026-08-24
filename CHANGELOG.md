## [0.14.2](https://github.com/mogretici/nestlens/compare/v0.14.1...v0.14.2) (2026-08-24)


### Bug Fixes

* **http-client:** an axios instance is a function, and was refused as one ([13a0dc7](https://github.com/mogretici/nestlens/commit/13a0dc7111c7489babba9f046665c90149564530))

## [0.14.1](https://github.com/mogretici/nestlens/compare/v0.14.0...v0.14.1) (2026-08-24)


### Bug Fixes

* **dashboard:** the application keeps its logger when the dashboard binds ([54084d4](https://github.com/mogretici/nestlens/commit/54084d428050bb136e7712b0fdf4555dec983a3c))

# [0.14.0](https://github.com/mogretici/nestlens/compare/v0.13.0...v0.14.0) (2026-08-24)


### Bug Fixes

* **cache:** watching a cache does not change what it returns ([610cc72](https://github.com/mogretici/nestlens/commit/610cc72adff0518d871850d64f83f7a8f2b646af))
* **graphql:** a persisted query is still an operation ([2672aef](https://github.com/mogretici/nestlens/commit/2672aef116bfcc837a10b7a1c7f86f90196313a6))


### Features

* **api:** delete the entries of one watcher, on purpose ([2a7b60e](https://github.com/mogretici/nestlens/commit/2a7b60e47ee4587d2ea22fb8a54c542635ae1242))

# [0.13.0](https://github.com/mogretici/nestlens/compare/v0.12.0...v0.13.0) (2026-08-23)


### Bug Fixes

* **storage:** `redis.db` decides the database, url or no url ([0077de4](https://github.com/mogretici/nestlens/commit/0077de4c974a8388e632b8cc894058aefdafa646))


### Features

* a production stance in one setting, and a startup line that shows it ([8225420](https://github.com/mogretici/nestlens/commit/82254200dfb5c161d5afab4c8753b2b0f30d2b1d))

# [0.12.0](https://github.com/mogretici/nestlens/compare/v0.11.0...v0.12.0) (2026-08-23)


### Bug Fixes

* **api:** resolving an entry that is gone is not a success ([568a680](https://github.com/mogretici/nestlens/commit/568a680356b0e4008792e94f88357f8a7acca2aa))
* **collector:** a batch filter that returns the wrong thing keeps the entries ([c4a6041](https://github.com/mogretici/nestlens/commit/c4a60413fef7454e5061fdb02ef39d317ceb73c5))
* **storage:** the entry ceiling an application configures is the one it gets ([42dc4f7](https://github.com/mogretici/nestlens/commit/42dc4f7ae258ee265ae8e8d9e73d1ddadb988620))


### Features

* **graphql:** a failed operation is an exception, like a failed request ([ce69c7f](https://github.com/mogretici/nestlens/commit/ce69c7f9c5f4f5a20b08bd03ca736fe01ccad519))
* **model:** record Prisma on the Prisma people are running ([8e1e13f](https://github.com/mogretici/nestlens/commit/8e1e13f771c0423de1f745762454cebe7922464e))

# [0.11.0](https://github.com/mogretici/nestlens/compare/v0.10.1...v0.11.0) (2026-08-23)


### Bug Fixes

* **alerting:** throttle by what happened, and stop the key map growing ([8512948](https://github.com/mogretici/nestlens/commit/851294813a3f5a07cb34f65857bd31a8d24ea597))
* **api:** a JSON array body reached the storage as undefined ([8b8c62a](https://github.com/mogretici/nestlens/commit/8b8c62a40e6b13f95fdda3c1954052eca109407c))
* **api:** a refused caller is told when to come back, in the body too ([9654699](https://github.com/mogretici/nestlens/commit/9654699833eca12779730153d160676607ce9060))
* **api:** a refused caller was handed the deployment's stack trace ([b0d146c](https://github.com/mogretici/nestlens/commit/b0d146c06cf0123fb28f7eb12c578d83cc48a17d))
* **api:** bound how far an offset may reach into the list ([9f8f080](https://github.com/mogretici/nestlens/commit/9f8f080fb54038be85caac96b7748adb8d097a14))
* **api:** bound the tags one request may write ([f3fe351](https://github.com/mogretici/nestlens/commit/f3fe3516fea4ffe81aa37a0ee21649920d8cd3c7))
* **api:** give the same parameter the same answer ([4c0aa4a](https://github.com/mogretici/nestlens/commit/4c0aa4a0a4b8e31f34dd2db53f3ff88156626ba4))
* **api:** refuse a mount path that cannot be one ([d6be80f](https://github.com/mogretici/nestlens/commit/d6be80fdd8575d032d908d7677567d9cac5a2f56))
* **api:** refuse access on any answer that is not a grant ([2b6b48f](https://github.com/mogretici/nestlens/commit/2b6b48f333a5a1cdf2eafe070e46934240a9fd41))
* **api:** stop the guard's cleanup timer with the application ([76852e5](https://github.com/mogretici/nestlens/commit/76852e559dcb43d45b4bd1cf96a424381beaec59))
* **api:** tell a rate-limited client when to come back ([a55d3f5](https://github.com/mogretici/nestlens/commit/a55d3f575721f3aa4eec4979a3127e4e8048ddc8))
* **api:** validate the offset-paged endpoints, and let the storage narrow them ([e56f960](https://github.com/mogretici/nestlens/commit/e56f960dd17cd141597377c783d160660555fd63))
* **api:** validate the tag endpoint, which was the last one reading raw params ([19766c2](https://github.com/mogretici/nestlens/commit/19766c2f3dc606a103df8b6bfcfae3b0dff9da76))
* **ci:** a job without a Redis service must not wait for one ([9fff5d0](https://github.com/mogretici/nestlens/commit/9fff5d0cd469a1d4da209e2e7739da14a8956e10))
* **collector:** never reject into the application ([7147a02](https://github.com/mogretici/nestlens/commit/7147a02bd947d3af8137ed80ff71770645d1f55f))
* **collector:** put a deadline on the flush that shutdown waits for ([741df7e](https://github.com/mogretici/nestlens/commit/741df7e5c15e9975898c139709194a6fa365e737))
* **collector:** record when a thing happened, not when it was written ([e4e60d0](https://github.com/mogretici/nestlens/commit/e4e60d05d6f7fd0384616633143eb99ff443ba60))
* **collector:** the storage is handed one batch at a time ([17681f4](https://github.com/mogretici/nestlens/commit/17681f4b59a6f9455f805261d01ecb411a8a4ba3))
* **config:** keep a long duration from becoming a one-millisecond timer ([c234d14](https://github.com/mogretici/nestlens/commit/c234d14529434bc89a2573dc0234c41136d1c75c))
* **core:** a body containing __proto__ lost that half of itself ([c34c64e](https://github.com/mogretici/nestlens/commit/c34c64e1d383b989ecde670fa254f577840fedf5))
* **core:** bound the text family hashing reads ([b7ae55d](https://github.com/mogretici/nestlens/commit/b7ae55dc70b9a05eeadfe95a18fa8ae1c3dc614d))
* **dashboard:** "Entry not found" is a claim about the entry ([df50215](https://github.com/mogretici/nestlens/commit/df5021597f4fb22183565acae021f5563bcbc26e))
* **dashboard:** "Load N new entries" counted entries the list would not show ([34b14ec](https://github.com/mogretici/nestlens/commit/34b14ec961fb9276578ef363aca87a3b7f880589))
* **dashboard:** a dashboard that cannot bind must not stop the application ([1539e68](https://github.com/mogretici/nestlens/commit/1539e68d286817d249398d1ffce2aaa587b3c258))
* **dashboard:** a monitor that cannot see must not report an all-clear ([51cf1ee](https://github.com/mogretici/nestlens/commit/51cf1ee2002b40b922f89cccba7d6e70e7b3ad16))
* **dashboard:** a recorded query cannot take the tab down ([d9cf777](https://github.com/mogretici/nestlens/commit/d9cf7770415efe18b079c591b0b856b0d277790f))
* **dashboard:** an action that failed has to say so ([8423b10](https://github.com/mogretici/nestlens/commit/8423b100651f9afc6ed567a0f50d9a0237af891a))
* **dashboard:** an activity list that could not be fetched is not an empty one ([209e0e6](https://github.com/mogretici/nestlens/commit/209e0e6ba6ad04c6aa1a7cd7692d810cb0520839))
* **dashboard:** an entry the view cannot read still shows what it has ([630392f](https://github.com/mogretici/nestlens/commit/630392fdb9c827eb730a614102e3d38b5c8e9fa4))
* **dashboard:** clearing entries reported success without looking ([16912b4](https://github.com/mogretici/nestlens/commit/16912b4d4343e2d1a9c7494a24c18668d4162f62))
* **dashboard:** give the tag editor somewhere to be ([f8e940f](https://github.com/mogretici/nestlens/commit/f8e940fee23e6792d66268e3dd94ca2d2572bcbd))
* **dashboard:** keep an entry id on the list once ([47d27ab](https://github.com/mogretici/nestlens/commit/47d27ab0b5505cca2b2460c70c0cbc7a1eddbb13))
* **dashboard:** let the header reserve its own room ([1bc55fd](https://github.com/mogretici/nestlens/commit/1bc55fdfc766e46fb94ec2302bd8b94a20ad9769))
* **dashboard:** Prune Now told the reader nothing ([21a6f2d](https://github.com/mogretici/nestlens/commit/21a6f2dc5df2e19aac4e631f3e68567f820027cb))
* **dashboard:** show the entry the URL names, not the one that answered last ([842e702](https://github.com/mogretici/nestlens/commit/842e702d52319ce72c1c70e04f82e22477a05c92))
* **dashboard:** tell the browser which theme the page is using ([f2bbf06](https://github.com/mogretici/nestlens/commit/f2bbf0653ec652d2e8e7307b9e4f943b2a3410ae))
* **dashboard:** the dashboard does not tell gravatar.com who its users are ([b9a7505](https://github.com/mogretici/nestlens/commit/b9a75052e274209aee9e038860d8bf3d4dedc71b))
* **dashboard:** the range filters draw the focus ring they took away ([8a4e1db](https://github.com/mogretici/nestlens/commit/8a4e1db92885dba60fe6c15d88f8fe9f726ad4f1))
* **dashboard:** the request row on the timeline said [object Object] ([4cc21a9](https://github.com/mogretici/nestlens/commit/4cc21a999cd587d15f7bc57e179869b8afceb1cc))
* **dashboard:** the resolver waterfall was drawn a million times too large ([f9db840](https://github.com/mogretici/nestlens/commit/f9db840b37b917129f7c679f627cd364d87b7934))
* **dashboard:** the retention shown was the default, not the deployment's ([5a6b1a5](https://github.com/mogretici/nestlens/commit/5a6b1a5516ad808168a270fed0c035ae5440b6c1))
* **docs:** a JSDoc example block took the documentation build down again ([568dfab](https://github.com/mogretici/nestlens/commit/568dfabedd0cec28fc4d7bf2aa61c32651571286))
* **example:** the seed script has been reporting zeros ([8a0735a](https://github.com/mogretici/nestlens/commit/8a0735aefc24ea175e955bdd64503b3c415e5674))
* **exception:** installing NestLens changed the application's responses ([49fcdd3](https://github.com/mogretici/nestlens/commit/49fcdd3eced118a06fd695f56cc08aa70b9a1fac))
* export the watchers and the token a reader is told to import ([e8dd2d9](https://github.com/mogretici/nestlens/commit/e8dd2d9f42cd3a1c7fc33a84ba694eedb9b8275c))
* **graphql:** a failure while recording is not the operation's answer ([91a637b](https://github.com/mogretici/nestlens/commit/91a637b885b6041a749059f8d8bfceafa83fa8e3))
* **graphql:** a mutation behind a comment was recorded as a query ([69d884b](https://github.com/mogretici/nestlens/commit/69d884b69c3e9efc44f4ebf2b10d0eadd3c2cb53))
* **graphql:** a subscription is not lost because watching it failed ([af7efe6](https://github.com/mogretici/nestlens/commit/af7efe61bad6ed7c4531c980c745f56e6bbe1e85))
* **graphql:** a subscription whose client goes away is one that ended ([a6d8cd5](https://github.com/mogretici/nestlens/commit/a6d8cd59bc242858190266f6562fdbc79bfa557c))
* **graphql:** bound the variables an operation records ([a3bab53](https://github.com/mogretici/nestlens/commit/a3bab53bdd59a256040cb5c54cb3d25dd4e41063))
* **graphql:** bound what a rejected operation stores, and report the true count ([d053312](https://github.com/mogretici/nestlens/commit/d053312852764659fb9e6a4785769b0b824916f0))
* **graphql:** record an operation once when two plugins are registered ([8848105](https://github.com/mogretici/nestlens/commit/8848105b208539a0bd0f178e158fd3bf24166918))
* **graphql:** report the N+1, not the property reads beside it ([a653a87](https://github.com/mogretici/nestlens/commit/a653a875af67ad32875774524dc03cc60facbb0e))
* **graphql:** the Mercurius adapter guessed what Mercurius passes it ([701299d](https://github.com/mogretici/nestlens/commit/701299d6feca8f56b8502c697d68e8a4cb45c15f))
* **graphql:** the sanitizer keeps what the storage can write ([5edcd3f](https://github.com/mogretici/nestlens/commit/5edcd3f0d71085baeb1548085da5a2c738a11447))
* **graphql:** three kinds of operation vanished as "introspection" ([effb3f2](https://github.com/mogretici/nestlens/commit/effb3f2184fba1dd12c68296f19ee5711f83256c))
* **graphql:** three options did nothing on Mercurius ([94e9d15](https://github.com/mogretici/nestlens/commit/94e9d155f92ce1c4a91dc6446c064964e91c587a))
* **guard:** an answer counts whether or not it came in a native promise ([64336f9](https://github.com/mogretici/nestlens/commit/64336f9d764c30d3beb59ac2465f6704ab38ebaf))
* **guard:** the rate limiter remembered every caller it had ever seen ([09c179d](https://github.com/mogretici/nestlens/commit/09c179ddef97976b93f53585bd4e0ca13284f536))
* **http-client:** let a masking term mean what it means everywhere else ([8a21998](https://github.com/mogretici/nestlens/commit/8a219985fa9104b0c92e4165604912bcb8cdf33d))
* **job:** record BullMQ jobs that are removed when they finish ([85900db](https://github.com/mogretici/nestlens/commit/85900db8ef1f9092e02e0c525437190b67c4ee1c))
* **log:** a log call must not fail because NestLens is watching it ([cad73ef](https://github.com/mogretici/nestlens/commit/cad73ef05d9745329c1f4816f5c0feb8b4be4740))
* **masking:** a field holding a function is recorded, not carried ([5cfea60](https://github.com/mogretici/nestlens/commit/5cfea605077925bef8112471a5863100588baec1))
* **masking:** bound the walk by how much it visits, not only how deep it goes ([b875890](https://github.com/mogretici/nestlens/commit/b8758908a33f82d87bcee43f68f99c92023ef0b7))
* **masking:** record the payloads an ORM produces instead of dropping them ([5fb300f](https://github.com/mogretici/nestlens/commit/5fb300f1d6ef378cb35b82aa8543b52670babcf3))
* **masking:** the same key was masked in one field and printed in the next ([6cbab86](https://github.com/mogretici/nestlens/commit/6cbab861ccda39aff2922370e7c03d3d45245b0e))
* **model:** nine inserts in ten went unrecorded ([0d99ade](https://github.com/mogretici/nestlens/commit/0d99ade90a198286c48af1c8cfd79792ab69baad))
* **model:** recording an entity no longer breaks the query that produced it ([b925b8e](https://github.com/mogretici/nestlens/commit/b925b8e90390fcb738994680890405b00eefd505))
* **module:** say so when a second forRoot moves the dashboard ([d27f62d](https://github.com/mogretici/nestlens/commit/d27f62d4fbaec305a466efce72847476a358ff4a))
* **module:** switching NestLens off left its middleware on every route ([1ecf7d8](https://github.com/mogretici/nestlens/commit/1ecf7d82ff2beb149cfdf6dc827e7fd9237e2cb4))
* **pruning:** let one place decide what pruning does ([f5bf329](https://github.com/mogretici/nestlens/commit/f5bf329e07a6d7c22f1849dc5b1bbdf3f44aac77))
* **query:** a global ignore pattern hid every other query ([09a390b](https://github.com/mogretici/nestlens/commit/09a390b0160828e5f6b5d9a3dd76e1afcc9c6b9a))
* **query:** find the Prisma client a Nest application actually has ([599fae5](https://github.com/mogretici/nestlens/commit/599fae541c9fefab98bf6da84600999171049189))
* **redis:** an upgrade keeps the tag list it already had ([903661c](https://github.com/mogretici/nestlens/commit/903661c2593faa0cf1c2a0285985b9acd4f173eb))
* **redis:** choose the page from the rows that match, not the matches from the page ([1a40a5f](https://github.com/mogretici/nestlens/commit/1a40a5fc10ae143404af3bf071f15ef46ef459d1))
* **redis:** do not take the application down when Redis is not there ([73d500d](https://github.com/mogretici/nestlens/commit/73d500d591b360fae217c383223e0ceff543bfd2))
* **redis:** the three figures the dashboard opens on were zero ([546c9cb](https://github.com/mogretici/nestlens/commit/546c9cba6f1df7dafdf09c761860849deeae5bf5))
* **schedule:** give the registry and the jobs back ([dd264f1](https://github.com/mogretici/nestlens/commit/dd264f1c37841535ebb954bbb980030f38fe5430))
* **schedule:** two runs of one job at once no longer swap their outcomes ([93cbdeb](https://github.com/mogretici/nestlens/commit/93cbdebfe28312ccb4518a773b2881b9499af92e))
* **security:** mask credentials embedded in URLs and command lines ([5b29b8f](https://github.com/mogretici/nestlens/commit/5b29b8f034b7047b865dd76893bd1f81fcf7c190))
* **security:** mask the query string inside recorded URLs ([a0a7e6e](https://github.com/mogretici/nestlens/commit/a0a7e6e0e8baaa4ac77300d82779287671dd2416))
* **security:** remove the absolute paths partial sanitisation was leaving ([81cff9a](https://github.com/mogretici/nestlens/commit/81cff9aa2a5a9ce185ca2f6d996d98c1e0ce006e))
* **sqlite:** a filter means the same thing whatever alphabet the text is in ([6a82cac](https://github.com/mogretici/nestlens/commit/6a82cacba76c1dc15f2cdc4456f93cd630c54799))
* **sqlite:** store one timestamp format, and the one every reader expects ([30eb179](https://github.com/mogretici/nestlens/commit/30eb179c24f43b229b72fe59d1d8ef5d33a5372c))
* **storage:** accept an offset with no limit on SQLite ([c27e9b8](https://github.com/mogretici/nestlens/commit/c27e9b8fa37c004427828cfb13ece8f972060526))
* **storage:** asking for operations without N+1 returned none of them ([ac8c5b6](https://github.com/mogretici/nestlens/commit/ac8c5b602160dc167129432eff7c7454fb3ca068))
* **storage:** do not stop the application when the database will not open ([af0aa7a](https://github.com/mogretici/nestlens/commit/af0aa7a6c95bbc587b609589fceafd883d40b4d4))
* **storage:** keep a small entry ceiling near what was asked for ([c210de6](https://github.com/mogretici/nestlens/commit/c210de61a12bf98f793906149e4e673ac709c85a))
* **storage:** make tags mean the same thing on every backend ([00a7e8a](https://github.com/mogretici/nestlens/commit/00a7e8a44ea2224da3dcd660ebaef453fb038a12))
* **storage:** one payload that cannot be written must not stop the rest ([42a08b6](https://github.com/mogretici/nestlens/commit/42a08b60eb143d28893d17327899a0c0a1093cc6))
* **storage:** search for the text the reader typed, not a pattern ([8ce0574](https://github.com/mogretici/nestlens/commit/8ce05747679c05d5701ba192aceaa3c59aae7f20))
* **storage:** treat a path filter as text, not as a regular expression ([6fe4fa4](https://github.com/mogretici/nestlens/commit/6fe4fa4470bec6e06fbf69ed04ebbbc888375a5a))
* **tags:** a tag NestLens writes is now as bounded as one a reader writes ([8e6b481](https://github.com/mogretici/nestlens/commit/8e6b4814384c8d5bb21dade97e55b2a2547ba4dc))
* **tags:** one entry carries no more tags than the API would accept ([b662ad3](https://github.com/mogretici/nestlens/commit/b662ad3930bd5fb49cf20b2ac174edcc57888877))
* **types:** export every configuration type from the package root ([dd787bb](https://github.com/mogretici/nestlens/commit/dd787bb2a616efc01743b812df199dadfdac9890))
* **watchers:** give back what the last five borrowed ([538cbe6](https://github.com/mogretici/nestlens/commit/538cbe6c320fee08f68a0a5d831be5ab86af4c35))
* **watchers:** make a wrapped method indistinguishable from the one it replaced ([2c18de3](https://github.com/mogretici/nestlens/commit/2c18de3b0450acdc26a8358beefb4bdc05b777f9))
* **watchers:** recognise NestLens's own traffic by path segment ([c5e3ddf](https://github.com/mogretici/nestlens/commit/c5e3ddf4d8d7ae18b7b0f3dff3ffc59a09703938))
* **watchers:** record the address the guard authorizes with ([66b9b49](https://github.com/mogretici/nestlens/commit/66b9b495e87b0320c130b8b68c926de149851f9c))
* **watchers:** stop discarding the payloads that are worth reading ([6a6235e](https://github.com/mogretici/nestlens/commit/6a6235e320914d6dba0421f1f57aebd93038637f))
* **watchers:** survive a value that is not an Error ([c98b24b](https://github.com/mogretici/nestlens/commit/c98b24b9bb328dea0e5acdafc1e3c517167fea4a))
* **watchers:** three more wrappers that changed what the caller got back ([931caa1](https://github.com/mogretici/nestlens/commit/931caa144f9a593ca63e32b5138c7e5938c35a8d))
* **watchers:** two watchers put back something the host never wrote ([884fd4f](https://github.com/mogretici/nestlens/commit/884fd4ff8a9971ef8d1b98458120b3e596dd43c0))
* **watchers:** wrapping replaced the caller's return value with a Promise ([4b134d5](https://github.com/mogretici/nestlens/commit/4b134d5163e1245c394b858820554a4b96f3b884))


### Features

* **api:** narrow a list by when it happened and how long it took ([ce2987a](https://github.com/mogretici/nestlens/commit/ce2987a11fec7bdbc1d47524dccbfe82a12d575f))
* **collector:** report whether NestLens is keeping up ([dc08ff3](https://github.com/mogretici/nestlens/commit/dc08ff35e5bf6cc946388eedcd5189d17ea66481))
* **dashboard:** filter a list by time window and by duration ([12f6f6d](https://github.com/mogretici/nestlens/commit/12f6f6d56e874e4e6bc4cc644d0911a04767ae18))
* **dashboard:** show when each thing inside a request happened ([31aed3c](https://github.com/mogretici/nestlens/commit/31aed3c226036661f2d8562651fa4e8b4e159d69))
* **graphql:** record subscriptions, which nothing was doing ([e9e8a86](https://github.com/mogretici/nestlens/commit/e9e8a862b1063c1c570e35b91dce61278c6bd668))
* remove the code nothing reaches ([0028d6e](https://github.com/mogretici/nestlens/commit/0028d6e8b5631d01248f90990876956170a6c5c6))
* **schedule:** record @Interval and @Timeout, and a failure as a failure ([a0ee721](https://github.com/mogretici/nestlens/commit/a0ee721133c721559641e445b00b90a1e6203aa0))
* **storage:** bound every store by size, not only by age ([3a53405](https://github.com/mogretici/nestlens/commit/3a53405399d5448780c31b198987c7c36f3c9a77))
* **tags:** a monitored tag keeps its entries through pruning ([de407e3](https://github.com/mogretici/nestlens/commit/de407e3df973921d0934254becd79c74411f627c))


### Performance Improvements

* **dashboard:** bound the live feed instead of growing it forever ([4fc5661](https://github.com/mogretici/nestlens/commit/4fc5661e62c9edc7e54ff67df24f6fc31916d9c9))
* **dashboard:** the live feed asked for a bigger page every five seconds ([076938f](https://github.com/mogretici/nestlens/commit/076938fa7ef71ee84d4143a31f127c4479a16676))
* **filters:** compile a path pattern once, not once per entry ([c263878](https://github.com/mogretici/nestlens/commit/c2638785fab2c683946bde14161987651cbdc917))
* **graphql:** stop hashing a query nobody will read in full ([97f76da](https://github.com/mogretici/nestlens/commit/97f76da5a29a7cb497c1b772949d919e6e5df086))
* **graphql:** stop keeping subscription messages nothing reads ([a2e4b0f](https://github.com/mogretici/nestlens/commit/a2e4b0f531772180543e78a769412a28e55126ef))
* **redis:** spend a round trip per page, not per row ([ed587ab](https://github.com/mogretici/nestlens/commit/ed587ab3d23bab2f0ecc131bf5e401c72209ebd3))
* **redis:** stop reading tags for entries a filter is about to discard ([a0f0de9](https://github.com/mogretici/nestlens/commit/a0f0de98cb0ec4ae4b1eec2b53fc84021ba5ad29))

## [0.10.1](https://github.com/mogretici/nestlens/compare/v0.10.0...v0.10.1) (2026-08-21)


### Bug Fixes

* **authorization:** honour an explicit null in allowedEnvironments ([8e64381](https://github.com/mogretici/nestlens/commit/8e643812caa7936902a10767fe0d5205e259dfaa))

# [0.10.0](https://github.com/mogretici/nestlens/compare/v0.9.7...v0.10.0) (2026-08-21)


### Bug Fixes

* **dashboard:** hide the memory row when nothing measured it ([720c784](https://github.com/mogretici/nestlens/commit/720c7844367cdb285ffbcf3a9fce9aa3a5aafed2))
* **graphql:** mask the fields a term names, not every field containing it ([ba4457b](https://github.com/mogretici/nestlens/commit/ba4457b04026f94d015c8ae9a4c040939f844170))
* **graphql:** mask what the collector would, in payloads it no longer walks ([11beb52](https://github.com/mogretici/nestlens/commit/11beb527663f33138ebd12bc8434759963c07d21))
* **module:** keep the application starting with the log watcher off ([dd71eb0](https://github.com/mogretici/nestlens/commit/dd71eb04c09ffc2e26338e133915a899934a3d8d))
* **watchers:** stop a configured watcher switching itself off ([6d6783c](https://github.com/mogretici/nestlens/commit/6d6783cc401d2a798fba014bc24901569b898de2))


### Features

* **dashboard:** serve the dashboard on a listener of its own ([04dcd5f](https://github.com/mogretici/nestlens/commit/04dcd5f9f44286065741921deccf1f00e0278596))
* **sampling:** record a fraction of traffic, a whole request at a time ([4889e66](https://github.com/mogretici/nestlens/commit/4889e66a21bf8e035df820a0c481f63d3ec44177))


### Performance Improvements

* **graphql:** reject an oversized response without serializing it ([ccd9e12](https://github.com/mogretici/nestlens/commit/ccd9e129ef94d1ad0873701dc04838fe702707c6))
* **request:** stop measuring heap growth nobody can use ([10829e3](https://github.com/mogretici/nestlens/commit/10829e368104203f7ee8ccd7ec8b253e26346b5d))
* **storage:** evict the oldest entry without walking the map ([a13d591](https://github.com/mogretici/nestlens/commit/a13d59105c3bad7a12c8c2c8d4c54055a011e18c))

## [0.9.7](https://github.com/mogretici/nestlens/compare/v0.9.6...v0.9.7) (2026-08-15)


### Bug Fixes

* **dashboard:** stop cursor refetch loop on Queries and Exceptions pages ([ed8066a](https://github.com/mogretici/nestlens/commit/ed8066afba22b22ed1ea2b520bb96b719203e63e))

## [0.9.6](https://github.com/mogretici/nestlens/compare/v0.9.5...v0.9.6) (2026-08-13)


### Bug Fixes

* **ci:** stop the auto-merge job waiting for itself ([df66e0d](https://github.com/mogretici/nestlens/commit/df66e0d20eb2806bac9dae5fc5a237d3fb221e10))

## [0.9.5](https://github.com/mogretici/nestlens/compare/v0.9.4...v0.9.5) (2026-08-13)


### Bug Fixes

* **example:** update the demo application's dependencies ([d3ad336](https://github.com/mogretici/nestlens/commit/d3ad336cafa9e82ceb225e8897e465759a23a5b6))

## [0.9.4](https://github.com/mogretici/nestlens/compare/v0.9.3...v0.9.4) (2026-08-13)


### Bug Fixes

* **api:** read the filters by name, not by whatever the request produced ([3c6dadb](https://github.com/mogretici/nestlens/commit/3c6dadb576b8a477a1f734b18e635ead3441c13f))

## [0.9.3](https://github.com/mogretici/nestlens/compare/v0.9.2...v0.9.3) (2026-08-13)


### Bug Fixes

* **security:** close what code scanning found in the shipped code ([9babf3b](https://github.com/mogretici/nestlens/commit/9babf3b48aefed7abc8a0f0757a0a2ad555a9d85))


### Reverts

* **example:** keep the lockfile CI can install ([1bc4a14](https://github.com/mogretici/nestlens/commit/1bc4a14038c05752651bf4195e5a8677c46f84bb))

## [0.9.2](https://github.com/mogretici/nestlens/compare/v0.9.1...v0.9.2) (2026-08-13)


### Bug Fixes

* **ci:** let the release reach main again ([37cf306](https://github.com/mogretici/nestlens/commit/37cf306d22f171bb7be16aa8b3c6e8e29b651932))
* **dashboard:** keep the application alive when a page throws ([ccd2aef](https://github.com/mogretici/nestlens/commit/ccd2aefab722338dc82f349ecad2b0766f4cc74d))

## [0.9.1](https://github.com/mogretici/nestlens/compare/v0.9.0...v0.9.1) (2026-08-13)


### Bug Fixes

* **docs:** build the documentation site in CI, where it can fail usefully ([9d416dc](https://github.com/mogretici/nestlens/commit/9d416dce047d620a068a4d9f2a398e385c2a5d74))

# [0.9.0](https://github.com/mogretici/nestlens/compare/v0.8.13...v0.9.0) (2026-08-13)


### Bug Fixes

* **ci:** pin the test-time sqlite driver to a version typeorm accepts ([68ea09b](https://github.com/mogretici/nestlens/commit/68ea09b733a98b21f085a62c7797360954377799))
* **ci:** stop Node 24 aborting in better-sqlite3's teardown ([b107377](https://github.com/mogretici/nestlens/commit/b10737725d3ccba3fabda788196d3828885baa92))
* **ci:** test the Node versions people actually run ([9bfaac7](https://github.com/mogretici/nestlens/commit/9bfaac78a9540cc077c2278b938b28fea8f7845d))
* **dashboard:** resolve the theme during render, not after it ([d116385](https://github.com/mogretici/nestlens/commit/d116385acd024b7e41f0f92b44e13867f2fa50da))
* **security:** close what CodeQL found on its first run ([205197a](https://github.com/mogretici/nestlens/commit/205197a01a545b9b865ee9723ca019bb9ab3738d)), closes [hi#severity](https://github.com/hi/issues/severity)
* **security:** serve from the listing, not from a path the caller wrote ([43b2385](https://github.com/mogretici/nestlens/commit/43b2385698c116329950888b1c8175813ab0020c))
* stop NestLens holding the process open ([8d5605d](https://github.com/mogretici/nestlens/commit/8d5605dbb45bfe3d84da166434ce95c5f261efa1))
* **storage:** hold every backend to one behaviour contract ([c6baae4](https://github.com/mogretici/nestlens/commit/c6baae42519c3aea637f1fac886c5eadcd83ad20))


### Features

* **dashboard:** compress the bundle on the way out ([dd2a322](https://github.com/mogretici/nestlens/commit/dd2a32253596ac7b76be7965785698c93119ac71))
* **package:** declare what the package publishes ([3dab3fa](https://github.com/mogretici/nestlens/commit/3dab3fa9098c282476469246006eff5ef710d290))
* **sqlite:** version the schema on disk ([e557f86](https://github.com/mogretici/nestlens/commit/e557f863371e74488107ec7c295cf257f5651fef))
* **storage:** say when in-memory entries cannot be shared ([5b6489b](https://github.com/mogretici/nestlens/commit/5b6489bf6f9771d0e2d788516173a5784cb39e00))


### Performance Improvements

* **dashboard:** one chunk per detail view, and real numbers for the rest ([58fbc09](https://github.com/mogretici/nestlens/commit/58fbc091c0122927ab23982f035a78c503636bdc))

## [0.8.13](https://github.com/mogretici/nestlens/compare/v0.8.12...v0.8.13) (2026-08-12)


### Bug Fixes

* **api:** enforce the input limits that were only ever documented ([b7b3f89](https://github.com/mogretici/nestlens/commit/b7b3f8918892d50e5b81f8c98e6ae47fd73a890a))
* **docs:** fail the build on a broken link instead of warning ([3d3a97b](https://github.com/mogretici/nestlens/commit/3d3a97b217843caa0beb452729612c1abcf64ef6))
* **security:** mask entry payloads, as the architecture always described ([fc60e7c](https://github.com/mogretici/nestlens/commit/fc60e7c4656cf80dc3446121c4fe80c0333628dd))

## [0.8.12](https://github.com/mogretici/nestlens/compare/v0.8.11...v0.8.12) (2026-08-12)


### Bug Fixes

* **api:** answer a POST without a body properly ([e630ea1](https://github.com/mogretici/nestlens/commit/e630ea184b259e029064ca2ee54a4e02fed36f86))

## [0.8.11](https://github.com/mogretici/nestlens/compare/v0.8.10...v0.8.11) (2026-08-12)


### Bug Fixes

* **watchers:** give back the methods they replaced ([3639108](https://github.com/mogretici/nestlens/commit/3639108daf85cd48ffea56540800c0300d758a3f))

## [0.8.10](https://github.com/mogretici/nestlens/compare/v0.8.9...v0.8.10) (2026-08-12)


### Bug Fixes

* attribute entries to the request that caused them ([b6e1d40](https://github.com/mogretici/nestlens/commit/b6e1d40e09e9dbb9cbd470c09d0c834adb066ed2))

## [0.8.9](https://github.com/mogretici/nestlens/compare/v0.8.8...v0.8.9) (2026-08-12)


### Bug Fixes

* **storage:** apply dashboard filters on Redis, and share one implementation ([4ec1f4e](https://github.com/mogretici/nestlens/commit/4ec1f4e7a357e407c7a1543034d9601c88710c97))

## [0.8.8](https://github.com/mogretici/nestlens/compare/v0.8.7...v0.8.8) (2026-08-12)


### Bug Fixes

* **core:** stop amplifying a storage outage inside the host application ([eebb021](https://github.com/mogretici/nestlens/commit/eebb02160ec30fbf4c58fe9d6ba80b831d5df3cb))
* **security:** mask fields whose names contain a sensitive term ([f5f66fe](https://github.com/mogretici/nestlens/commit/f5f66fe6193e9d9e457007e53dba482eee0b79e8))

## [0.8.7](https://github.com/mogretici/nestlens/compare/v0.8.6...v0.8.7) (2026-08-11)


### Bug Fixes

* **security:** stop reading X-Forwarded-For when no proxy is trusted ([fa76233](https://github.com/mogretici/nestlens/commit/fa7623368fedb9319d954ad3c853c96be1489249))

## [0.8.6](https://github.com/mogretici/nestlens/compare/v0.8.5...v0.8.6) (2026-08-11)


### Bug Fixes

* **storage:** keep booting when Redis cannot answer the rescore ([b439535](https://github.com/mogretici/nestlens/commit/b439535bec89da393f1af1091507c4a6e91f6ce9))
* **storage:** page Redis by sequence, not by save time ([c1ee1d3](https://github.com/mogretici/nestlens/commit/c1ee1d310f989581b0ce4899d0873f9ad6310d9a))

## [0.8.5](https://github.com/mogretici/nestlens/compare/v0.8.4...v0.8.5) (2026-08-11)


### Bug Fixes

* **dashboard:** match the SPA catch-all to the router in use ([a060d39](https://github.com/mogretici/nestlens/commit/a060d39ea3bf9670e6d8afd348f13032d3e04df2))

## [0.8.4](https://github.com/mogretici/nestlens/compare/v0.8.3...v0.8.4) (2026-08-11)


### Bug Fixes

* **package:** declare the express types and stop shipping unusable maps ([bc69c15](https://github.com/mogretici/nestlens/commit/bc69c15d02746e24edce1438326d90012f45aa7d))

## [0.8.3](https://github.com/mogretici/nestlens/compare/v0.8.2...v0.8.3) (2026-08-11)


### Bug Fixes

* **dashboard:** call useMemo before the early return in RelatedEntries ([08d2f1e](https://github.com/mogretici/nestlens/commit/08d2f1eaa10df45892a7edf636ae008c2aa6020e))
* **deps:** update dependencies with published advisories ([280998a](https://github.com/mogretici/nestlens/commit/280998a3d523be90319c87ba646db33fba3532c2))

## [0.8.2](https://github.com/mogretici/nestlens/compare/v0.8.1...v0.8.2) (2026-08-11)


### Bug Fixes

* **core:** reject a non-positive pruning interval or age ([190c10d](https://github.com/mogretici/nestlens/commit/190c10d3d028e2ee89984a218cb38beacf88dcf9))
* **storage:** read limit 0 the same way on every backend ([03764c4](https://github.com/mogretici/nestlens/commit/03764c4cfd5b622ed559cd1d96c6a4de5141c321))
* **storage:** report why Redis storage failed to start ([bc6d473](https://github.com/mogretici/nestlens/commit/bc6d473fde6ba988d23508d0e2da1f67dd4297fc))
* **watchers:** honour a capture size limit of zero ([93b891f](https://github.com/mogretici/nestlens/commit/93b891f4d9c213625a3c919bccb99b1a69a9d19c))

## [0.8.1](https://github.com/mogretici/nestlens/compare/v0.8.0...v0.8.1) (2026-08-11)


### Bug Fixes

* make the dev server reach the API, and the e2e suite mean something ([ac832ec](https://github.com/mogretici/nestlens/commit/ac832ec35024c555c0d4bed2afc5d936696ad3fb))

# [0.8.0](https://github.com/mogretici/nestlens/compare/v0.7.0...v0.8.0) (2026-08-10)


### Bug Fixes

* order entries deterministically when timestamps collide ([0ce9372](https://github.com/mogretici/nestlens/commit/0ce937227d4068c30437842dab5d11ecbddd8d45))
* track scheduled jobs on NestJS 9 and 10 ([02f485e](https://github.com/mogretici/nestlens/commit/02f485ee942958c43b112eac56d6a6e60f167350))


### Features

* remove deprecated configuration fields ([378aeed](https://github.com/mogretici/nestlens/commit/378aeedd1ef3693e8bc2fe98f3a3ad800110740a))
* serve NestLens's own responses outside the host's pipeline ([2207446](https://github.com/mogretici/nestlens/commit/2207446332298e4f0c821bdc8e508546349d9f1b))


### Performance Improvements

* let browsers cache the dashboard bundle ([f8f5565](https://github.com/mogretici/nestlens/commit/f8f556500965830057d42709ab4203b8bd3f6ed5))

# [0.7.0](https://github.com/mogretici/nestlens/compare/v0.6.2...v0.7.0) (2026-08-10)


### Features

* **dashboard:** real-time live-tail over SSE ([f53190e](https://github.com/mogretici/nestlens/commit/f53190eed6a96b7a0bb33daf1e5404bf348ad269))
* real-time entry stream powering SSE live-tail and webhook alerting ([eeda758](https://github.com/mogretici/nestlens/commit/eeda758049c19fcdeefdbe9f7f8b8bcc25bca983))

## [0.6.2](https://github.com/mogretici/nestlens/compare/v0.6.1...v0.6.2) (2026-08-10)


### Bug Fixes

* stop recording NestLens's own traffic behind a global prefix ([dfb8839](https://github.com/mogretici/nestlens/commit/dfb8839390524f9f339917b6170f0a6beb150e79))

## [0.6.1](https://github.com/mogretici/nestlens/compare/v0.6.0...v0.6.1) (2026-08-07)


### Bug Fixes

* keep the dashboard reachable under a global prefix ([bb62e4f](https://github.com/mogretici/nestlens/commit/bb62e4f09e302520e6b2928d7116c62928b6ee23)), closes [#10](https://github.com/mogretici/nestlens/issues/10)

# [0.6.0](https://github.com/mogretici/nestlens/compare/v0.5.2...v0.6.0) (2026-08-06)


### Features

* honour the configured path when mounting the dashboard and API ([2c58bae](https://github.com/mogretici/nestlens/commit/2c58baed91489475d0a7b8fe01ccb03271efbaff)), closes [#10](https://github.com/mogretici/nestlens/issues/10)


### ⚠️ Behaviour change — the REST API moved

`NestLensConfig.path` was documented as the base URL for the dashboard **and** its API, but nothing read it when mounting routes. It now works, which means the API sits under the configured prefix instead of the server root:

| | before | after (default `path`) |
|---|---|---|
| Dashboard | `/nestlens` | `/nestlens` — unchanged |
| REST API | `/__nestlens__/api/*` | `/nestlens/__nestlens__/api/*` |
| SSE stream | `/__nestlens__/stream` | `/nestlens/__nestlens__/stream` |

Nothing to do if you only use the dashboard. Update your URLs if you call the internal API directly:

```diff
- curl -X POST http://localhost:3000/__nestlens__/api/prune
+ curl -X POST http://localhost:3000/nestlens/__nestlens__/api/prune
```

Shipped as a minor rather than a major because the package is still pre-1.0, where [SemVer §4](https://semver.org/#spec-item-4) allows breaking changes without a major bump.

## [0.5.2](https://github.com/mogretici/nestlens/compare/v0.5.1...v0.5.2) (2026-08-06)


### Bug Fixes

* **dashboard:** make duration and number formatting deterministic ([c37ad7c](https://github.com/mogretici/nestlens/commit/c37ad7c3cf9f910670ff1d5410759e28c5006814))

## [0.5.1](https://github.com/mogretici/nestlens/compare/v0.5.0...v0.5.1) (2026-08-06)


### Bug Fixes

* stop importing @nestjs/swagger as an undeclared dependency ([213a766](https://github.com/mogretici/nestlens/commit/213a766950717056f886a968a5783595a8c6fd64))

# [0.5.0](https://github.com/mogretici/nestlens/compare/v0.4.2...v0.5.0) (2026-08-04)


### Features

* GraphQL headers & tags, entry search, and duplicate-package-safe API validation ([a735cf8](https://github.com/mogretici/nestlens/commit/a735cf8de75d3c35f9a57519493e767bbbbceb08))
* **graphql:** make masked request headers configurable ([60d1420](https://github.com/mogretici/nestlens/commit/60d1420a1cd7f1af5d3a685c7060ee702fb612be))

## [0.4.2](https://github.com/mogretici/nestlens/compare/v0.4.1...v0.4.2) (2026-06-30)


### Bug Fixes

* **http:** support the Fastify adapter, not just Express ([f303bce](https://github.com/mogretici/nestlens/commit/f303bcec66a08bed7e8aa61b406c228e23419948)), closes [#8](https://github.com/mogretici/nestlens/issues/8)
* **schedule:** auto-detect SchedulerRegistry via DiscoveryService ([3de8fe2](https://github.com/mogretici/nestlens/commit/3de8fe274747dac1e23b0bc37cc3edb8fdad4094)), closes [#7](https://github.com/mogretici/nestlens/issues/7)

## [0.4.1](https://github.com/mogretici/nestlens/compare/v0.4.0...v0.4.1) (2026-04-15)


### Bug Fixes

* **query:** wire TypeORM watcher through EntitySubscriber + Logger ([#6](https://github.com/mogretici/nestlens/issues/6)) ([36cc78d](https://github.com/mogretici/nestlens/commit/36cc78d69e894600725c1173e19027e2e55774c2)), closes [#5](https://github.com/mogretici/nestlens/issues/5)

# [0.4.0](https://github.com/mogretici/nestlens/compare/v0.3.5...v0.4.0) (2026-01-27)


### Features

* add BullMQ integration with setup methods and event handling ([42d155b](https://github.com/mogretici/nestlens/commit/42d155b221e2dd6bdda808c7561585f1ee616c98))
* add BullMQ integration with setup methods and event handling ([#4](https://github.com/mogretici/nestlens/issues/4)) ([67dc547](https://github.com/mogretici/nestlens/commit/67dc54787c6b05718a3451e728c434196825a04f))

## [0.3.5](https://github.com/mogretici/nestlens/compare/v0.3.4...v0.3.5) (2026-01-08)


### Bug Fixes

* update dashboard views and payload types for enhanced data handling ([6d1225e](https://github.com/mogretici/nestlens/commit/6d1225e30d27c9a35a7cc388d688d1924c634e2a))

## [0.3.4](https://github.com/mogretici/nestlens/compare/v0.3.3...v0.3.4) (2026-01-08)


### Bug Fixes

* add `tsc-alias` to build pipeline and update dependencies ([5f84677](https://github.com/mogretici/nestlens/commit/5f84677646f4e9a83660a74014f53a4db679d5b7))

## [0.3.3](https://github.com/mogretici/nestlens/compare/v0.3.2...v0.3.3) (2026-01-08)


### Bug Fixes

* enhance validation, exception handling, and package resolution ([0736a34](https://github.com/mogretici/nestlens/commit/0736a34a7f492ae844011d20f3f386193c26c563))

## [0.3.2](https://github.com/mogretici/nestlens/compare/v0.3.1...v0.3.2) (2026-01-08)


### Bug Fixes

* implement Mercurius auto-registration for GraphQL watcher ([6ef5092](https://github.com/mogretici/nestlens/commit/6ef50926109ae9edc1095db7d4aa0d914aa881ea))
* specify root option in sendFile to support pnpm package structure ([#2](https://github.com/mogretici/nestlens/issues/2)) ([ce92fdd](https://github.com/mogretici/nestlens/commit/ce92fddcf050930c2bf087a0a2bb8693ddde4a93))

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.3.1](https://github.com/mogretici/nestlens/compare/v0.3.0...v0.3.1) (2026-01-03)


### Bug Fixes

* run sync-versions before commit via postbump hook ([811527d](https://github.com/mogretici/nestlens/commit/811527d104ce22ce936b95d4edd18ad7cab6b9a3))

## [0.3.0](https://github.com/mogretici/nestlens/compare/v0.2.0...v0.3.0) (2025-12-27)


### Features

* add GraphQL watcher, dashboard improvements, docs screenshots ([b414f25](https://github.com/mogretici/nestlens/commit/b414f25ff3b31836408eec8e23db8bed79cb1d2b))


### Bug Fixes

* handle non-HTTP contexts and improve exception handling ([f58ef0e](https://github.com/mogretici/nestlens/commit/f58ef0e0cfe79e549585720ff4c90bdf02232c3a))

## [0.2.1] - 2024-12-24

### Bug Fixes
- Handle non-HTTP contexts properly in request watcher
- Improve exception handling for edge cases

## [0.2.0] - 2024-12-23

### Features
- Add support for multiple storage drivers
  - **Memory Storage**: In-memory storage for development
  - **SQLite Storage**: Persistent storage with automatic pruning
  - **Redis Storage**: Distributed storage for production
- Comprehensive test suite for all storage drivers

## [0.1.2] - 2024-12-21

### Bug Fixes
- Include README and LICENSE files in npm package

## [0.1.1] - 2024-12-20

### Documentation
- Update README with badge links and improved installation instructions

## [0.1.0] - 2024-12-20

### Added
- Initial release
- 18 watchers for comprehensive monitoring:
  - Request Watcher - HTTP request tracking
  - Query Watcher - Database query monitoring (TypeORM, Prisma, Raw SQL)
  - Exception Watcher - Error tracking with stack traces
  - Log Watcher - Centralized log aggregation
  - Job Watcher - Bull/BullMQ queue monitoring
  - Cache Watcher - Cache operations tracking
  - Redis Watcher - Redis command monitoring
  - HTTP Client Watcher - Outgoing HTTP requests (Axios)
  - Mail Watcher - Email tracking
  - Event Watcher - Event emission monitoring
  - Schedule Watcher - Cron job tracking
  - Command Watcher - CLI command monitoring
  - Notification Watcher - Notification tracking
  - Gate Watcher - Authorization checks
  - View Watcher - Template rendering
  - Model Watcher - ORM model events
  - Dump Watcher - Debug dumps
  - Batch Watcher - Batch operations
- Beautiful React dashboard with dark mode
- Real-time auto-refresh
- Powerful filtering system
- Family tracking for related entries
- Automatic slow query detection
- Sensitive data masking
- SQLite storage with automatic pruning
- IP whitelist and custom authorization
- Cursor-based pagination for large datasets
- Comprehensive test suite (2300+ tests)

### Security
- Pagination limits to prevent DoS (max 1000 records)
- Input validation on all API endpoints
- Sensitive header and body masking
- Configurable access control
