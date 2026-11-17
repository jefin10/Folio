package app.folio.wear.complication

import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import app.folio.wear.data.Money
import app.folio.wear.data.Store
import app.folio.wear.data.Sync
import app.folio.wear.ui.MainActivity

private fun plain(s: String) = PlainComplicationText.Builder(s).build()

private fun openApp(ctx: Context, route: String?): PendingIntent =
    PendingIntent.getActivity(
        ctx, route.hashCode(),
        Intent(ctx, MainActivity::class.java).apply { if (route != null) putExtra("route", route); flags = Intent.FLAG_ACTIVITY_NEW_TASK },
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

private fun build(ctx: Context, type: ComplicationType, short: String, title: String, long: String, route: String?): ComplicationData? = when (type) {
    ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(plain(short), plain("$title $short")).setTitle(plain(title)).setTapAction(openApp(ctx, route)).build()
    ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(plain(long), plain(long)).setTitle(plain(title)).setTapAction(openApp(ctx, route)).build()
    else -> null
}

/** "Today ₹640" — tap to record a new spend. */
class TodaySpendComplicationService : SuspendingComplicationDataSourceService() {
    override fun getPreviewData(type: ComplicationType): ComplicationData? = build(this, type, "₹640", "Today", "Spent today ₹640", null)

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val hidden = Store.snapshot(this)?.hideBalances == true
        val v = Store.todaySpend(this, Sync.today())
        val s = if (hidden) "••••" else Money.compact(v)
        return build(this, request.complicationType, s, "Today", "Spent today $s", "add")
    }
}

/** "Spendable ₹1.2L" — tap to open Folio. */
class SpendableComplicationService : SuspendingComplicationDataSourceService() {
    override fun getPreviewData(type: ComplicationType): ComplicationData? = build(this, type, "₹1.2L", "Left", "Spendable ₹1.2L", null)

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
        val snap = Store.snapshot(this) ?: return build(this, request.complicationType, "—", "Folio", "Open Folio on phone", null)
        val s = if (snap.hideBalances) "••••" else Money.compact(snap.liquid)
        return build(this, request.complicationType, s, "Left", "Spendable $s", null)
    }
}
