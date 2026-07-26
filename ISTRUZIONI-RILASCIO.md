# LOCA PRO 0.0.2

Questa versione introduce la nuova Dashboard operativa:

- widget giornaliero con ora, data e agenda dalle 08:00 alle 20:00;
- attività e appuntamenti collegati allo stesso archivio del Calendario;
- attività senza orario raccolte nella sezione “Tutto il giorno”;
- clic su una fascia oraria per preparare una nuova attività;
- LOCA Regia con priorità generate da attività e scadenze reali;
- colonna Prossime scadenze uniformata allo stile della Dashboard.

## Creazione dell'aggiornamento

1. Aprire PowerShell nella cartella del progetto.
2. Eseguire `npm.cmd install` solo se richiesto o se manca la cartella `node_modules`.
3. Eseguire `npm.cmd run build`.
4. Controllare che nella cartella `dist` siano presenti i tre file della versione 0.0.2.

## Pubblicazione della Release v0.0.2

Creare su GitHub una nuova Release con tag `v0.0.2` e allegare dalla cartella
`dist` tutti questi file:

- `LOCA-PRO-Setup-0.0.2.exe`
- `LOCA-PRO-Setup-0.0.2.exe.blockmap`
- `latest.yml`

La Release deve essere pubblicata, non lasciata come bozza.

Una volta pubblicata, chi usa LOCA PRO 0.0.1 potrà ricevere la 0.0.2 dal pulsante
**Aggiornamenti** oppure tramite il controllo automatico all'avvio. I dati locali
non vengono cancellati dall'aggiornamento.

## Requisito GitHub

Per consentire all'app installata di leggere le Release senza inserire token o
password nel programma, il repository usato per gli aggiornamenti deve essere
pubblico. Se il codice sorgente deve restare privato, è preferibile usare un
secondo repository pubblico contenente soltanto le Release.
