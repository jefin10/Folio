package app.folio.wear.data

import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import org.json.JSONObject

/** Receives the phone's snapshot and acknowledgements, even when the app is closed. */
class WatchListenerService : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        for (e in events) {
            if (e.type == DataEvent.TYPE_CHANGED && e.dataItem.uri.path == "/folio/snapshot") {
                DataMapItem.fromDataItem(e.dataItem).dataMap.getString("json")?.let { Store.saveSnapshot(applicationContext, it) }
                Sync.refreshSurfaces(applicationContext)
            }
        }
    }

    override fun onMessageReceived(message: MessageEvent) {
        if (message.path != "/folio/ack") return
        val o = JSONObject(String(message.data))
        Store.ack(applicationContext, o.getString("id"), o.optBoolean("ok"), o.optString("message").ifEmpty { null })
        Sync.refreshSurfaces(applicationContext)
    }
}
