package app.folio.wear.data

import android.content.ComponentName
import android.content.Context
import androidx.wear.tiles.TileService
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import app.folio.wear.complication.SpendableComplicationService
import app.folio.wear.complication.TodaySpendComplicationService
import app.folio.wear.tile.FolioTileService
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import java.time.LocalDate
import java.time.ZoneId

object Sync {
    fun today(): String = LocalDate.now(ZoneId.of("Asia/Kolkata")).toString()

    /**
     * Save locally first (works with no phone in range), then hand to the Data
     * Layer. Data items are persisted by Play services and delivered whenever
     * the phone reconnects, so this is safe offline.
     */
    fun record(ctx: Context, e: QueuedEntry) {
        Store.enqueue(ctx, e)
        send(ctx, e)
        refreshSurfaces(ctx)
    }

    fun send(ctx: Context, e: QueuedEntry) {
        val req = PutDataMapRequest.create("/folio/entry/${e.id}").apply {
            dataMap.putString("json", e.toWire())
            dataMap.putLong("at", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        Wearable.getDataClient(ctx).putDataItem(req)
    }

    /** Re-send anything still pending (e.g. after a failed delivery) and ask the phone for fresh numbers. */
    fun retryAndRefresh(ctx: Context) {
        Store.queue(ctx).filter { it.status == "pending" }.forEach { send(ctx, it) }
        Wearable.getNodeClient(ctx).connectedNodes.addOnSuccessListener { nodes ->
            nodes.forEach { Wearable.getMessageClient(ctx).sendMessage(it.id, "/folio/request-sync", ByteArray(0)) }
        }
    }

    fun refreshSurfaces(ctx: Context) {
        TileService.getUpdater(ctx).requestUpdate(FolioTileService::class.java)
        ComplicationDataSourceUpdateRequester.create(ctx, ComponentName(ctx, TodaySpendComplicationService::class.java)).requestUpdateAll()
        ComplicationDataSourceUpdateRequester.create(ctx, ComponentName(ctx, SpendableComplicationService::class.java)).requestUpdateAll()
    }
}
