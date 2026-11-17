package app.folio.wear.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

data class Account(val id: String, val name: String, val group: String, val balancePaise: Long, val color: String?)
data class Category(val id: String, val name: String, val color: String?)
data class Person(val id: String, val name: String, val outstandingPaise: Long)
data class Due(val name: String, val dueOn: String, val amountPaise: Long?, val state: String)

/** Compact summary sent by the phone (see apps/mobile/src/lib/snapshot.ts). */
data class Snapshot(
    val generatedAt: String,
    val hideBalances: Boolean,
    val liquid: Long,
    val bankBalance: Long,
    val receivables: Long,
    val creditOutstanding: Long,
    val afterObligations: Long,
    val todaySpend: Long,
    val monthSpend: Long,
    val accounts: List<Account>,
    val categories: List<Category>,
    val people: List<Person>,
    val upcoming: List<Due>,
) {
    companion object {
        fun parse(json: String): Snapshot? = try {
            val o = JSONObject(json)
            fun arr(k: String) = o.optJSONArray(k) ?: JSONArray()
            fun l(k: String) = o.optString(k, "0").toLongOrNull() ?: 0L
            Snapshot(
                generatedAt = o.optString("generatedAt"),
                hideBalances = o.optBoolean("hideBalances"),
                liquid = l("liquid"), bankBalance = l("bankBalance"), receivables = l("receivables"),
                creditOutstanding = l("creditOutstanding"), afterObligations = l("afterObligations"),
                todaySpend = l("todaySpend"), monthSpend = l("monthSpend"),
                accounts = (0 until arr("accounts").length()).map { i -> arr("accounts").getJSONObject(i).let { Account(it.getString("id"), it.getString("name"), it.optString("group"), it.optString("balance", "0").toLongOrNull() ?: 0, it.optString("color").ifEmpty { null }) } },
                categories = (0 until arr("categories").length()).map { i -> arr("categories").getJSONObject(i).let { Category(it.getString("id"), it.getString("name"), it.optString("color").ifEmpty { null }) } },
                people = (0 until arr("people").length()).map { i -> arr("people").getJSONObject(i).let { Person(it.getString("id"), it.getString("name"), it.optString("outstanding", "0").toLongOrNull() ?: 0) } },
                upcoming = (0 until arr("upcoming").length()).map { i -> arr("upcoming").getJSONObject(i).let { Due(it.getString("name"), it.getString("dueOn"), if (it.isNull("amount")) null else it.optString("amount").toLongOrNull(), it.optString("state")) } },
            )
        } catch (e: Exception) {
            null
        }
    }
}

/** A watch-recorded expense waiting for the phone. Its id is the ledger idempotency key. */
data class QueuedEntry(
    val id: String,
    val amountPaise: Long,
    val description: String,
    val accountId: String?,
    val categoryId: String?,
    val personId: String?,
    val personSharePaise: Long?,
    val occurredOn: String,
    val viaVoice: Boolean,
    val status: String, // pending | synced | failed
    val message: String?,
) {
    /** Wire format the phone bridge reads (apps/mobile/src/lib/wear.ts → WatchEntry). */
    fun toWire(): String = JSONObject().apply {
        put("id", id)
        put("amount", "${amountPaise / 100}.${(amountPaise % 100).toString().padStart(2, '0')}")
        put("description", description)
        put("accountId", accountId ?: JSONObject.NULL)
        put("categoryId", categoryId ?: JSONObject.NULL)
        put("personId", personId ?: JSONObject.NULL)
        put("personShare", personSharePaise?.let { "${it / 100}.${(it % 100).toString().padStart(2, '0')}" } ?: JSONObject.NULL)
        put("occurredOn", occurredOn)
        put("viaVoice", viaVoice)
    }.toString()

    fun toJson(): JSONObject = JSONObject(toWire()).put("amountPaise", amountPaise).put("personSharePaise", personSharePaise ?: JSONObject.NULL).put("status", status).put("message", message ?: "")

    companion object {
        fun fromJson(o: JSONObject) = QueuedEntry(
            id = o.getString("id"), amountPaise = o.getLong("amountPaise"), description = o.optString("description"),
            accountId = o.optString("accountId").takeIf { it.isNotEmpty() && it != "null" }, categoryId = o.optString("categoryId").takeIf { it.isNotEmpty() && it != "null" },
            personId = o.optString("personId").takeIf { it.isNotEmpty() && it != "null" }, personSharePaise = if (o.isNull("personSharePaise")) null else o.optLong("personSharePaise"),
            occurredOn = o.optString("occurredOn"), viaVoice = o.optBoolean("viaVoice"), status = o.optString("status", "pending"), message = o.optString("message").ifEmpty { null },
        )

        fun create(amountPaise: Long, description: String, accountId: String?, categoryId: String?, personId: String?, share: Long?, occurredOn: String, viaVoice: Boolean) =
            QueuedEntry(UUID.randomUUID().toString(), amountPaise, description, accountId, categoryId, personId, share, occurredOn, viaVoice, "pending", null)
    }
}

/** App-private storage on the watch (sandboxed; entries leave once the phone acknowledges them). */
object Store {
    private const val PREFS = "folio_wear"

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun saveSnapshot(ctx: Context, json: String) = prefs(ctx).edit().putString("snapshot", json).putLong("snapshotAt", System.currentTimeMillis()).apply()
    fun snapshot(ctx: Context): Snapshot? = prefs(ctx).getString("snapshot", null)?.let(Snapshot::parse)
    fun snapshotAge(ctx: Context): Long = System.currentTimeMillis() - prefs(ctx).getLong("snapshotAt", 0)

    @Synchronized
    fun queue(ctx: Context): List<QueuedEntry> {
        val raw = prefs(ctx).getString("queue", "[]")!!
        val a = JSONArray(raw)
        return (0 until a.length()).map { QueuedEntry.fromJson(a.getJSONObject(it)) }
    }

    @Synchronized
    private fun writeQueue(ctx: Context, items: List<QueuedEntry>) {
        // Keep pending/failed items plus the 20 most recent synced ones for the history view.
        val keep = items.filter { it.status != "synced" } + items.filter { it.status == "synced" }.takeLast(20)
        prefs(ctx).edit().putString("queue", JSONArray(keep.map { it.toJson() }).toString()).apply()
    }

    @Synchronized
    fun enqueue(ctx: Context, e: QueuedEntry) = writeQueue(ctx, queue(ctx).filter { it.id != e.id } + e)

    @Synchronized
    fun ack(ctx: Context, id: String, ok: Boolean, message: String?) =
        writeQueue(ctx, queue(ctx).map { if (it.id == id) it.copy(status = if (ok) "synced" else "failed", message = message) else it })

    /** Today's spend including watch entries the phone hasn't confirmed yet. */
    fun todaySpend(ctx: Context, today: String): Long =
        (snapshot(ctx)?.todaySpend ?: 0L) + queue(ctx).filter { it.status == "pending" && it.occurredOn == today }.sumOf { it.amountPaise }
}
